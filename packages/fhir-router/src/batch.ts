import {
  allOk,
  badRequest,
  getReferenceString,
  getStatus,
  isOk,
  OperationOutcomeError,
  parseSearchRequest,
  Event,
  generateRandomId,
  normalizeOperationOutcome,
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

const localBundleReference = /urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/**
 * The BatchProcessor class contains the state for processing a batch/transaction bundle.
 * In particular, it tracks rewritten ID's as necessary.
 */
class BatchProcessor {
  private readonly resolvedIdentities: Record<string, string>;

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
    this.resolvedIdentities = Object.create(null);
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

    const resultEntries: (BundleEntry | OperationOutcome)[] = new Array(this.bundle.entry?.length ?? 0);
    let count = 0;
    let errors = 0;

    const entryIndices = await this.preprocessBundle(resultEntries);
    for (const entryIndex of entryIndices) {
      const entry = this.bundle.entry?.[entryIndex] as BundleEntry;
      const rewritten = this.rewriteIdsInObject(entry);
      try {
        count++;
        resultEntries[entryIndex] = await this.processBatchEntry(rewritten);
      } catch (err) {
        errors++;
        resultEntries[entryIndex] = buildBundleResponse(normalizeOperationOutcome(err));
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

  private async preprocessBundle(results: BundleEntry[]): Promise<number[]> {
    const entries = this.bundle.entry;
    if (!entries?.length) {
      throw new OperationOutcomeError(badRequest('Missing bundle entries'));
    }

    const bucketedEntries: Record<BundleEntryRequest['method'], number[]> = {
      DELETE: [],
      POST: [],
      PUT: [],
      PATCH: [],
      GET: [],
      HEAD: [],
    };
    const seenIdentities = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const method = entry.request?.method;
      if (!method) {
        results[i] = buildBundleResponse(
          badRequest('Missing Bundle entry request method', `Bundle.entry[${i}].request.method`)
        );
        continue;
      }
      if (!entry.request?.url) {
        results[i] = buildBundleResponse(
          badRequest('Missing Bundle entry request URL', `Bundle.entry[${i}].request.url`)
        );
        continue;
      }

      bucketedEntries[method]?.push(i);
      let resolved: { placeholder: string; reference: string } | undefined;
      try {
        resolved = await this.resolveIdentity(entry, `Bundle.entry[${i}]`);
      } catch (err: any) {
        if ((err as OperationOutcomeError).outcome && this.bundle.type !== 'transaction') {
          results[i] = buildBundleResponse(err.outcome);
          continue;
        }
        throw err;
      }
      if (resolved) {
        this.resolvedIdentities[resolved.placeholder] = resolved.reference;
        if (seenIdentities.has(resolved.reference)) {
          throw new OperationOutcomeError(badRequest('Duplicate resource identity found in Bundle'));
        }
      }
    }

    const result = [];
    for (const bucket of Object.values(bucketedEntries)) {
      result.push(...bucket);
    }
    return result;
  }

  private async resolveIdentity(
    entry: BundleEntry,
    path: string
  ): Promise<{ placeholder: string; reference: string } | undefined> {
    switch (entry.request?.method) {
      case 'POST':
        if (entry.resource && entry.fullUrl?.startsWith('urn:uuid:')) {
          entry.resource.id = generateRandomId();
          return {
            placeholder: entry.fullUrl,
            reference: getReferenceString(entry.resource),
          };
        }
        break;
      case 'DELETE':
      case 'PUT':
      case 'PATCH':
        if (entry.request?.url?.includes('?')) {
          // Resolve conditional update via search
          const resolved = await this.repo.searchResources(parseSearchRequest(entry.request.url));
          if (resolved.length !== 1) {
            throw new OperationOutcomeError(
              badRequest(
                `Conditional ${entry.request.method} matched ${resolved.length} resources`,
                path + '.request.url'
              )
            );
          }
          return { placeholder: entry.request.url, reference: getReferenceString(resolved[0]) };
        } else if (entry.request?.url.includes('/')) {
          return { placeholder: entry.request.url, reference: entry.request.url };
        }
        break;
      case 'GET':
      case 'HEAD':
        // Ignore read-only requests
        break;
      default:
        throw new OperationOutcomeError(
          badRequest('Invalid batch request method: ' + entry.request?.method, path + '.request.method')
        );
    }
    return undefined;
  }

  /**
   * Processes a single entry from a FHIR batch request.
   * @param entry - The bundle entry.
   * @returns The bundle entry response.
   */
  private async processBatchEntry(entry: BundleEntry): Promise<BundleEntry> {
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
        return buildBundleResponse(allOk, matchingResource);
      }
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

    return buildBundleResponse(result[0], result[1]);
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

    return this.rewriteIdsInArray(JSON.parse(Buffer.from(patchResource.data, 'base64').toString('utf8')));
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

  private rewriteIdsInString(input: string): string {
    const match = input.match(localBundleReference);
    if (match) {
      if (this.bundle.type !== 'transaction') {
        const event: LogEvent = {
          type: 'warn',
          message: 'Invalid internal reference in batch',
        };
        this.router.dispatchEvent(event);
      }
      const fullUrl = match[0];
      const referenceString = this.resolvedIdentities[fullUrl];
      return referenceString ? input.replaceAll(fullUrl, referenceString) : input;
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
