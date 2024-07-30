import {
  allOk,
  badRequest,
  getReferenceString,
  getStatus,
  isOk,
  normalizeOperationOutcome,
  OperationOutcomeError,
  parseSearchRequest,
  resolveId,
  Event,
} from '@medplum/core';
import { Bundle, BundleEntry, BundleEntryRequest, OperationOutcome, Resource } from '@medplum/fhirtypes';
import { FhirRouter } from './fhirrouter';
import { FhirRepository } from './repo';
import { HttpMethod } from './urlrouter';

/**
 * Processes a FHIR batch request.
 *
 * See: https://www.hl7.org/fhir/http.html#transaction
 * @param router - The FHIR router.
 * @param repo - The FHIR repository.
 * @param bundle - The input bundle.
 * @returns The bundle response.
 */
export async function processBatch(router: FhirRouter, repo: FhirRepository, bundle: Bundle): Promise<Bundle> {
  return new BatchProcessor(router, repo, bundle).processBatch();
}

/**
 * The BatchProcessor class contains the state for processing a batch/transaction bundle.
 * In particular, it tracks rewritten ID's as necessary.
 */
class BatchProcessor {
  private readonly ids: Record<string, Resource>;

  /**
   * Creates a batch processor.
   * @param router - The FHIR router.
   * @param repo - The FHIR repository.
   * @param bundle - The input bundle.
   */
  constructor(
    private readonly router: FhirRouter,
    private readonly repo: FhirRepository,
    private readonly bundle: Bundle
  ) {
    this.ids = {};
  }

  /**
   * Processes a FHIR batch request.
   * @returns The bundle response.
   */
  async processBatch(): Promise<Bundle> {
    const bundleType = this.bundle.type;
    if (!bundleType) {
      throw new OperationOutcomeError(badRequest('Missing bundle type'));
    }

    if (bundleType !== 'batch' && bundleType !== 'transaction') {
      throw new OperationOutcomeError(badRequest('Unrecognized bundle type'));
    }

    const entries = this.bundle.entry;
    if (!entries) {
      throw new OperationOutcomeError(badRequest('Missing bundle entry'));
    }

    const resultEntries: BundleEntry[] = [];
    let count = 0;
    let errors = 0;
    for (const entry of entries) {
      const rewritten = this.rewriteIdsInObject(entry);
      // If the resource 'id' element is specified, we want to replace the `urn:uuid:*` string and
      // remove the `resourceType` prefix
      if (entry.resource?.id) {
        rewritten.resource.id = this.rewriteIdsInString(entry.resource.id, true);
      }

      try {
        count++;
        resultEntries.push(await this.processBatchEntry(rewritten));
      } catch (err) {
        errors++;
        resultEntries.push(buildBundleResponse(normalizeOperationOutcome(err)));
      }
    }

    const event: BatchEvent = {
      type: 'batch',
      bundleType,
      count,
      errors,
      size: JSON.stringify(this.bundle).length,
    };
    this.router.dispatchEvent(event);

    return {
      resourceType: 'Bundle',
      type: `${bundleType}-response`,
      entry: resultEntries,
    };
  }

  /**
   * Processes a single entry from a FHIR batch request.
   * @param entry - The bundle entry.
   * @returns The bundle entry response.
   */
  private async processBatchEntry(entry: BundleEntry): Promise<BundleEntry> {
    this.validateEntry(entry);

    const request = entry.request as BundleEntryRequest;

    if (entry.resource?.resourceType && request.ifNoneExist) {
      const searchBundle = await this.repo.search(
        parseSearchRequest(`${entry.resource.resourceType}?${request.ifNoneExist}`)
      );
      const entries = searchBundle.entry as BundleEntry[];
      if (entries.length > 1) {
        return buildBundleResponse(badRequest('Multiple matches'));
      }
      if (entries.length === 1) {
        const matchingResource = entries[0].resource as Resource;
        if (entry.fullUrl) {
          this.addReplacementId(entry.fullUrl, matchingResource);
        }
        return buildBundleResponse(allOk, matchingResource);
      }

      this.router.log('warn', 'Conditional mutation in batch', {
        method: request.method,
        url: request.url,
      });
    }

    let body = entry.resource;
    if (request.method === 'PATCH') {
      body = this.parsePatchBody(entry);
    }

    // Pass in dummy host for parsing purposes.
    // The host is ignored.
    const url = new URL(request.url as string, 'https://example.com/');

    const result = await this.router.handleRequest(
      {
        method: request.method as HttpMethod,
        pathname: url.pathname,
        params: Object.create(null),
        query: Object.fromEntries(url.searchParams),
        body,
      },
      this.repo
    );

    if (entry.fullUrl && result.length === 2) {
      this.addReplacementId(entry.fullUrl, result[1]);
    }

    return buildBundleResponse(result[0], result[1]);
  }

  private validateEntry(entry: BundleEntry): void {
    if (!entry.request) {
      throw new OperationOutcomeError(badRequest('Missing entry.request'));
    }

    if (!entry.request.method) {
      throw new OperationOutcomeError(badRequest('Missing entry.request.method'));
    }

    if (!entry.request.url) {
      throw new OperationOutcomeError(badRequest('Missing entry.request.url'));
    }
  }

  private parsePatchBody(entry: BundleEntry): any {
    const patchResource = entry.resource;
    if (!patchResource) {
      throw new OperationOutcomeError(badRequest('Missing entry.resource'));
    }

    if (patchResource.resourceType !== 'Binary') {
      throw new OperationOutcomeError(badRequest('Patch resource must be a Binary'));
    }

    if (!patchResource.data) {
      throw new OperationOutcomeError(badRequest('Missing entry.resource.data'));
    }

    const body = JSON.parse(Buffer.from(patchResource.data, 'base64').toString('utf8'));
    if (!body) {
      throw new OperationOutcomeError(badRequest('Empty patch body'));
    }

    if (!Array.isArray(body)) {
      throw new OperationOutcomeError(badRequest('Patch body must be an array'));
    }

    return this.rewriteIdsInArray(body);
  }

  private addReplacementId(fullUrl: string, resource: Resource): void {
    if (fullUrl.startsWith('urn:uuid:')) {
      this.ids[fullUrl] = resource;
    }
  }

  private rewriteIds(input: any): any {
    if (Array.isArray(input)) {
      return this.rewriteIdsInArray(input);
    }
    if (typeof input === 'string') {
      return this.rewriteIdsInString(input);
    }
    if (typeof input === 'object' && input !== null) {
      return this.rewriteIdsInObject(input);
    }
    return input;
  }

  private rewriteIdsInArray(input: any[]): any[] {
    return input.map((item) => this.rewriteIds(item));
  }

  private rewriteIdsInObject(input: any): any {
    return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, this.rewriteIds(v)]));
  }

  private rewriteIdsInString(input: string, removeResourceType = false): string {
    const matches = /urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/.exec(input);
    if (matches) {
      if (this.bundle.type !== 'transaction') {
        const event: LogEvent = {
          type: 'warn',
          message: 'Invalid internal reference in batch',
        };
        this.router.dispatchEvent(event);
      }
      const fullUrl = matches[0];
      const resource = this.ids[fullUrl];
      if (resource) {
        let referenceString: string | undefined = getReferenceString(resource);
        if (removeResourceType) {
          referenceString = resolveId({ reference: referenceString });
        }
        return referenceString ? input.replaceAll(fullUrl, referenceString) : input;
      }
    }
    return input;
  }
}

function buildBundleResponse(outcome: OperationOutcome, resource?: Resource): BundleEntry {
  return {
    response: {
      outcome: outcome,
      status: getStatus(outcome).toString(),
      location: isOk(outcome) && resource?.id ? getReferenceString(resource) : undefined,
    },
    resource,
  };
}

export interface BatchEvent extends Event {
  bundleType: Bundle['type'];
  count: number;
  errors: number;
  size: number;
}

export interface LogEvent extends Event {
  message: string;
  data?: Record<string, any>;
}
