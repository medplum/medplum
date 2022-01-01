import { allOk, badRequest, getReferenceString, getStatus, isOk, notFound } from '@medplum/core';
import { Bundle, BundleEntry, OperationOutcome, Resource } from '@medplum/fhirtypes';
import { URL } from 'url';
import { Repository, RepositoryResult } from './repo';
import { parseSearchUrl } from './search';

/**
 * Processes a FHIR batch request.
 *
 * See: https://www.hl7.org/fhir/http.html#transaction
 *
 * @param repo The FHIR repository.
 * @param bundle The input bundle.
 * @returns The bundle response.
 */
export async function processBatch(repo: Repository, bundle: Bundle): RepositoryResult<Bundle> {
  return new BatchProcessor(repo, bundle).processBatch();
}

/**
 * The BatchProcessor class contains the state for processing a batch/transaction bundle.
 * In particular, it tracks rewritten ID's as necessary.
 */
class BatchProcessor {
  private readonly ids: Record<string, Resource>;

  /**
   * Creates a batch processor.
   * @param repo The FHIR repository.
   * @param bundle The input bundle.
   */
  constructor(private readonly repo: Repository, private readonly bundle: Bundle) {
    this.ids = {};
  }

  /**
   * Processes a FHIR batch request.
   * @param repo The FHIR repository.
   * @param bundle The input bundle.
   * @returns The bundle response.
   */
  async processBatch(): RepositoryResult<Bundle> {
    const bundleType = this.bundle.type;
    if (!bundleType) {
      return [badRequest('Missing bundle type'), undefined];
    }

    if (bundleType !== 'batch' && bundleType !== 'transaction') {
      return [badRequest('Unrecognized bundle type'), undefined];
    }

    const entries = this.bundle.entry;
    if (!entries) {
      return [badRequest('Missing bundle entry'), undefined];
    }

    const resultEntries: BundleEntry[] = [];
    for (const entry of entries) {
      const rewritten = this.rewriteIdsInObject(entry);
      resultEntries.push(await this.processBatchEntry(rewritten));
    }

    const result: Bundle = {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: resultEntries,
    };

    return [allOk, result];
  }

  /**
   * Processes a single entry from a FHIR batch request.
   * @param entry The bundle entry.
   * @returns The bundle entry response.
   */
  private async processBatchEntry(entry: BundleEntry): Promise<BundleEntry> {
    if (!entry.request) {
      return buildBundleResponse(badRequest('Missing entry.request'));
    }

    if (!entry.request.method) {
      return buildBundleResponse(badRequest('Missing entry.request.method'));
    }

    if (!entry.request.url) {
      return buildBundleResponse(badRequest('Missing entry.request.url'));
    }

    // Pass in dummy host for parsing purposes.
    // The host is ignored.
    const url = new URL(entry.request.url, 'https://example.com/');

    switch (entry.request.method) {
      case 'GET':
        return this.processGet(url);

      case 'POST':
        return this.processPost(entry, url);

      case 'PUT':
        return this.processPut(entry, url);

      case 'DELETE':
        return this.processDelete(url);

      default:
        return buildBundleResponse(badRequest('Unsupported entry.request.method'));
    }
  }

  /**
   * Process a batch GET request.
   * This dispatches to search, read, etc.
   * @param url The entry request URL.
   * @returns The bundle entry response.
   */
  private async processGet(url: URL): Promise<BundleEntry> {
    const path = url.pathname.split('/');
    if (path.length === 2) {
      return this.processSearch(url);
    }
    if (path.length === 3) {
      return this.processReadResource(path[1], path[2]);
    }
    if (path.length === 4 && path[3] === '_history') {
      return this.processReadHistory(path[1], path[2]);
    }
    return buildBundleResponse(notFound);
  }

  /**
   * Process a batch search request.
   * @param repo The FHIR repository.
   * @param url The entry request URL.
   * @returns The bundle entry response.
   */
  private async processSearch(url: URL): Promise<BundleEntry> {
    const [outcome, bundle] = await this.repo.search(parseSearchUrl(url));
    return buildBundleResponse(outcome, bundle, true);
  }

  /**
   * Process a batch read request.
   * @param repo The FHIR respostory.
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns The bundle entry response.
   */
  private async processReadResource(resourceType: string, id: string): Promise<BundleEntry> {
    const [outcome, resource] = await this.repo.readResource(resourceType, id);
    return buildBundleResponse(outcome, resource, true);
  }

  /**
   * Process a batch read history request.
   * @param repo The FHIR respostory.
   * @param resourceType The FHIR resource type.
   * @param id The FHIR resource ID.
   * @returns The bundle entry response.
   */
  private async processReadHistory(resourceType: string, id: string): Promise<BundleEntry> {
    const [outcome, resource] = await this.repo.readHistory(resourceType, id);
    return buildBundleResponse(outcome, resource, true);
  }

  /**
   * Process a batch POST request.
   * This dispatches to create, etc.
   * @param entry The bundle entry.
   * @param url The entry request URL.
   * @returns The bundle entry response.
   */
  private async processPost(entry: BundleEntry, url: URL): Promise<BundleEntry> {
    const path = url.pathname.split('/');
    if (path.length === 2) {
      return this.processCreateResource(entry);
    }
    return buildBundleResponse(notFound);
  }

  /**
   * Process a batch create request.
   *
   * Handles conditional create using "ifNoneExist".
   *
   * See: https://www.hl7.org/fhir/http.html#cond-update
   *
   * @param entry The bundle entry.
   * @returns The bundle entry response.
   */
  private async processCreateResource(entry: BundleEntry): Promise<BundleEntry> {
    if (!entry.resource) {
      return buildBundleResponse(badRequest('Missing entry.resource'));
    }

    if (!entry.resource.resourceType) {
      return buildBundleResponse(badRequest('Missing entry.resource.resourceType'));
    }

    let outcome: OperationOutcome | undefined = undefined;
    let result: Resource | undefined = undefined;

    if (entry.request?.ifNoneExist) {
      const baseUrl = `https://example.com/${entry.resource.resourceType}`;
      const searchUrl = new URL('?' + entry.request.ifNoneExist, baseUrl);
      const [searchOutcome, searchBundle] = await this.repo.search(parseSearchUrl(searchUrl));
      if (!isOk(searchOutcome)) {
        return buildBundleResponse(searchOutcome);
      }
      const entries = searchBundle?.entry as BundleEntry[];
      if (entries.length > 1) {
        return buildBundleResponse(badRequest('Multiple matches'));
      }
      if (entries.length === 1) {
        outcome = allOk;
        result = entries[0].resource;
      }
    }

    if (!result) {
      const [createOutcome, createResult] = await this.repo.createResource(entry.resource);
      if (!isOk(createOutcome)) {
        return buildBundleResponse(createOutcome);
      }
      outcome = createOutcome;
      result = createResult;
    }

    if (entry.fullUrl && result) {
      this.addReplacementId(entry.fullUrl, result);
    }

    return buildBundleResponse(outcome as OperationOutcome, result);
  }

  /**
   * Process a batch PUT request.
   * This dispatches to update, etc.
   * @param entry The bundle entry.
   * @param url The entry request URL.
   * @returns The bundle entry response.
   */
  private async processPut(entry: BundleEntry, url: URL): Promise<BundleEntry> {
    const path = url.pathname.split('/');
    if (path.length === 3) {
      return this.processUpdateResource(entry.resource);
    }
    return buildBundleResponse(notFound);
  }

  /**
   * Process a batch update request.
   * @param resource The FHIR resource.
   * @returns The bundle entry response.
   */
  private async processUpdateResource(resource: Resource | undefined): Promise<BundleEntry> {
    if (!resource) {
      return buildBundleResponse(badRequest('Missing entry.resource'));
    }
    const [outcome, result] = await this.repo.updateResource(resource);
    return buildBundleResponse(outcome, result);
  }

  /**
   * Process a batch DELETE request.
   * This dispatches to deleteResource.
   * @param url The entry request URL.
   * @returns The bundle entry response.
   */
  private async processDelete(url: URL): Promise<BundleEntry> {
    const path = url.pathname.split('/');
    if (path.length === 3) {
      return this.processDeleteResource(path[1], path[2]);
    }
    return buildBundleResponse(notFound);
  }

  /**
   * Process a batch delete request.
   * @param resource The FHIR resource.
   * @returns The bundle entry response.
   */
  private async processDeleteResource(resourceType: string, id: string): Promise<BundleEntry> {
    const [outcome] = await this.repo.deleteResource(resourceType, id);
    return buildBundleResponse(outcome);
  }

  private addReplacementId(fullUrl: string, resource: Resource): void {
    if (fullUrl?.startsWith('urn:uuid:')) {
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
    if (typeof input === 'object') {
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
    const resource = this.ids[input];
    return resource ? getReferenceString(resource) : input;
  }
}

function buildBundleResponse(outcome: OperationOutcome, resource?: Resource, full?: boolean): BundleEntry {
  return {
    response: {
      outcome: outcome,
      status: getStatus(outcome).toString(),
      location: isOk(outcome) && resource?.id ? getReferenceString(resource) : undefined,
    },
    resource: (full && resource) || undefined,
  };
}
