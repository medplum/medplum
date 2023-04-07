import {
  allOk,
  badRequest,
  getReferenceString,
  getStatus,
  isOk,
  normalizeOperationOutcome,
  OperationOutcomeError,
  parseSearchUrl,
} from '@medplum/core';
import { Bundle, BundleEntry, BundleEntryRequest, OperationOutcome, Resource } from '@medplum/fhirtypes';
import { FhirRouter } from './fhirrouter';
import { FhirRepository } from './repo';
import { HttpMethod } from './urlrouter';

/**
 * Processes a FHIR batch request.
 *
 * See: https://www.hl7.org/fhir/http.html#transaction
 *
 * @param router The FHIR router.
 * @param repo The FHIR repository.
 * @param bundle The input bundle.
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
  readonly #ids: Record<string, Resource>;

  /**
   * Creates a batch processor.
   * @param router The FHIR router.
   * @param repo The FHIR repository.
   * @param bundle The input bundle.
   */
  constructor(
    private readonly router: FhirRouter,
    private readonly repo: FhirRepository,
    private readonly bundle: Bundle
  ) {
    this.#ids = {};
  }

  /**
   * Processes a FHIR batch request.
   * @param repo The FHIR repository.
   * @param bundle The input bundle.
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
    for (const entry of entries) {
      const rewritten = this.#rewriteIdsInObject(entry);
      try {
        resultEntries.push(await this.#processBatchEntry(rewritten));
      } catch (err) {
        resultEntries.push(buildBundleResponse(normalizeOperationOutcome(err)));
      }
    }

    return {
      resourceType: 'Bundle',
      type: (bundleType + '-response') as 'batch-response' | 'transaction-response',
      entry: resultEntries,
    };
  }

  /**
   * Processes a single entry from a FHIR batch request.
   * @param entry The bundle entry.
   * @returns The bundle entry response.
   */
  async #processBatchEntry(entry: BundleEntry): Promise<BundleEntry> {
    this.#validateEntry(entry);

    const request = entry.request as BundleEntryRequest;

    if (entry.resource?.resourceType && request.ifNoneExist) {
      const baseUrl = `https://example.com/${entry.resource.resourceType}`;
      const searchUrl = new URL('?' + request.ifNoneExist, baseUrl);
      const searchBundle = await this.repo.search(parseSearchUrl(searchUrl));
      const entries = searchBundle?.entry as BundleEntry[];
      if (entries.length > 1) {
        return buildBundleResponse(badRequest('Multiple matches'));
      }
      if (entries.length === 1) {
        const matchingResource = entries[0].resource as Resource;
        if (entry.fullUrl) {
          this.#addReplacementId(entry.fullUrl, matchingResource);
        }
        return buildBundleResponse(allOk, matchingResource);
      }
    }

    let body = entry.resource;
    if (request.method === 'PATCH') {
      body = this.#parsePatchBody(entry);
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
      this.#addReplacementId(entry.fullUrl, result[1]);
    }

    return buildBundleResponse(result[0], result[1]);
  }

  #validateEntry(entry: BundleEntry): void {
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

  #parsePatchBody(entry: BundleEntry): any {
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

    return JSON.parse(Buffer.from(patchResource.data, 'base64').toString('utf8'));
  }

  #addReplacementId(fullUrl: string, resource: Resource): void {
    if (fullUrl?.startsWith('urn:uuid:')) {
      this.#ids[fullUrl] = resource;
    }
  }

  #rewriteIds(input: any): any {
    if (Array.isArray(input)) {
      return this.#rewriteIdsInArray(input);
    }
    if (typeof input === 'string') {
      return this.#rewriteIdsInString(input);
    }
    if (typeof input === 'object') {
      return this.#rewriteIdsInObject(input);
    }
    return input;
  }

  #rewriteIdsInArray(input: any[]): any[] {
    return input.map((item) => this.#rewriteIds(item));
  }

  #rewriteIdsInObject(input: any): any {
    return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, this.#rewriteIds(v)]));
  }

  #rewriteIdsInString(input: string): string {
    const matches = input.match(/urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/);
    if (matches) {
      const fullUrl = matches[0];
      const resource = this.#ids[fullUrl];
      if (resource) {
        return input.replaceAll(fullUrl, getReferenceString(resource));
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
