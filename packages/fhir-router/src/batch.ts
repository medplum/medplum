import {
  badRequest,
  getReferenceString,
  getStatus,
  isOk,
  OperationOutcomeError,
  parseSearchRequest,
  Event,
  normalizeOperationOutcome,
  notFound,
  splitN,
} from '@medplum/core';
import { Bundle, BundleEntry, BundleEntryRequest, OperationOutcome, Resource } from '@medplum/fhirtypes';
import { FhirRequest, FhirRouteHandler, FhirRouteMetadata, FhirRouter, RestInteraction } from './fhirrouter';
import { FhirRepository } from './repo';
import { HttpMethod, RouteResult } from './urlrouter';
import { IncomingHttpHeaders } from 'node:http';

const maxUpdates = 50;
const maxSerializableTransactionEntries = 8;

const localBundleReference = /urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const uuidUriPrefix = 'urn:uuid';

type BundleEntryIdentity = { placeholder: string; reference: string };

type BundlePreprocessInfo = {
  ordering: number[];
  requiresStrongTransaction: boolean;
  updates: number;
};

/**
 * Processes a FHIR batch request.
 *
 * See: https://www.hl7.org/fhir/http.html#transaction
 * @param router - The FHIR router.
 * @param repo - The FHIR repository.
 * @param bundle - The input bundle.
 * @param req - The request for the batch.
 * @returns The bundle response.
 */
export async function processBatch(
  router: FhirRouter,
  repo: FhirRepository,
  bundle: Bundle,
  req: FhirRequest
): Promise<Bundle> {
  const processor = new BatchProcessor(router, repo, bundle, req);
  return processor.run();
}

/**
 * The BatchProcessor class contains the state for processing a batch/transaction bundle.
 * In particular, it tracks rewritten IDs as necessary.
 */
class BatchProcessor {
  private readonly resolvedIdentities: Record<string, string>;

  /**
   * Creates a batch processor.
   * @param router - The FHIR router.
   * @param repo - The FHIR repository.
   * @param bundle - The input bundle.
   * @param req - The request for the batch.
   */
  constructor(
    private readonly router: FhirRouter,
    private readonly repo: FhirRepository,
    private readonly bundle: Bundle,
    private readonly req: FhirRequest
  ) {
    this.resolvedIdentities = Object.create(null);
  }

  /**
   * Processes a FHIR batch request.
   * @returns The bundle response.
   */
  async run(): Promise<Bundle> {
    const bundleType = this.bundle.type;
    if (bundleType !== 'batch' && bundleType !== 'transaction') {
      throw new OperationOutcomeError(badRequest('Unrecognized bundle type: ' + bundleType));
    }

    const resultEntries: (BundleEntry | OperationOutcome)[] = new Array(this.bundle.entry?.length ?? 0);
    const bundleInfo = await this.preprocessBundle(resultEntries);

    if (!this.isTransaction()) {
      return this.processBatch(bundleInfo, resultEntries);
    }

    if (bundleInfo.updates > maxUpdates) {
      throw new OperationOutcomeError(badRequest('Transaction contains more update operations than allowed'));
    }
    if (bundleInfo.requiresStrongTransaction && resultEntries.length > maxSerializableTransactionEntries) {
      throw new OperationOutcomeError(badRequest('Transaction requires strict isolation but has too many entries'));
    }

    return this.repo.withTransaction(() => this.processBatch(bundleInfo, resultEntries), {
      serializable: bundleInfo.requiresStrongTransaction,
    });
  }

  /**
   * Scans the Bundle in order to ensure entries are processed in the correct sequence,
   * as well as to identify any operations that might require specific handling.
   *
   * @param results - The array of result entries, to track partial results.
   * @returns The information gathered from scanning the Bundle.
   */
  private async preprocessBundle(results: BundleEntry[]): Promise<BundlePreprocessInfo> {
    const entries = this.bundle.entry;
    if (!entries?.length) {
      throw new OperationOutcomeError(badRequest('Missing bundle entries'));
    }

    const bucketedEntries: Record<RestInteraction, number[]> = {
      // Processed in order, by interaction type
      transaction: [],
      batch: [],
      delete: [],
      create: [],
      update: [],
      patch: [],
      operation: [],
      'search-system': [],
      'search-type': [],
      read: [],
      vread: [],
      'history-system': [],
      'history-type': [],
      'history-instance': [],
    };
    const seenIdentities = new Set<string>();
    let requiresStrongTransaction = false;
    let updates = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const method = entry.request?.method;
      if (!method) {
        results[i] = buildBundleResponse(
          badRequest('Missing Bundle entry request method', `Bundle.entry[${i}].request.method`)
        );
        continue;
      }
      const outcome = await this.preprocessEntry(entry, i, seenIdentities);
      if (outcome) {
        if (!this.isTransaction()) {
          results[i] = buildBundleResponse(outcome);
          continue;
        }
        throw new OperationOutcomeError(outcome);
      }

      const route = this.getRouteForEntry(entry);
      const interaction = route?.data?.interaction as RestInteraction;
      if (interaction === 'create' && entry.request?.ifNoneExist) {
        // Conditional create requires strong (serializable) transaction to
        // guarantee uniqueness of created resource
        requiresStrongTransaction = true;
      } else if (interaction === 'update') {
        if (entry.request?.url.includes('?')) {
          // Conditional update requires strong (serializable) transaction to
          // guarantee uniqueness of possibly-created resource
          requiresStrongTransaction = true;
        }
        updates++;
      } else if (interaction === 'delete' && entry.request?.url.includes('?')) {
        // Conditional delete requires strong (serializable) transaction
        requiresStrongTransaction = true;
      }
      bucketedEntries[interaction]?.push(i);
    }

    const ordering = [];
    for (const bucket of Object.values(bucketedEntries)) {
      ordering.push(...bucket);
    }
    return {
      ordering,
      requiresStrongTransaction,
      updates,
    };
  }

  /**
   * Resolves the resource identity associated with an entry, and tracks it for later reference rewriting.
   * @see https://www.hl7.org/fhir/R4/http.html#trules
   *
   * @param entry - The entry to resolve.
   * @param index - The index of the Bundle entry.
   * @param seenIdentities - The set of resolved identities that have already been seen in preprocessing.
   * @returns - The (error) result for the entry, if it could not be preprocessed.
   */
  private async preprocessEntry(
    entry: BundleEntry,
    index: number,
    seenIdentities: Set<string>
  ): Promise<OperationOutcome | undefined> {
    if (!entry.request?.url) {
      return badRequest('Missing Bundle entry request URL', `Bundle.entry[${index}].request.url`);
    }

    let resolved: { placeholder: string; reference: string } | undefined;
    try {
      resolved = await this.resolveIdentity(entry, `Bundle.entry[${index}]`);
    } catch (err: any) {
      if (err instanceof OperationOutcomeError) {
        return err.outcome;
      }
      throw err;
    }

    if (resolved) {
      // Track resolved identity for reference rewriting
      this.resolvedIdentities[resolved.placeholder] = resolved.reference;

      // If in a transaction, ensure identity is unique
      if (this.isTransaction()) {
        if (seenIdentities.has(resolved.reference)) {
          throw new OperationOutcomeError(badRequest('Duplicate resource identity found in Bundle'));
        }
        seenIdentities.add(resolved.reference);
      }
    }
    return undefined;
  }

  private async resolveIdentity(entry: BundleEntry, path: string): Promise<BundleEntryIdentity | undefined> {
    const route = this.getRouteForEntry(entry);
    const interaction = route?.data?.interaction;
    if (!interaction) {
      throw new OperationOutcomeError(notFound);
    }

    switch (interaction) {
      case 'create':
        // Ensure that resources to be created have a
        return this.resolveCreateIdentity(entry);
      case 'delete':
      case 'update':
      case 'patch':
        return this.resolveModificationIdentity(entry, path);
      default:
        // Ignore read-only and complex operations
        return undefined;
    }
  }

  private getRouteForEntry(entry: BundleEntry): RouteResult<FhirRouteHandler, FhirRouteMetadata> | undefined {
    const [requestPath] = splitN(entry.request?.url as string, '?', 2);
    return this.router.find(entry.request?.method as HttpMethod, requestPath);
  }

  private async resolveCreateIdentity(entry: BundleEntry): Promise<BundleEntryIdentity | undefined> {
    if (entry.request?.ifNoneExist) {
      const existing = await this.repo.searchResources(
        parseSearchRequest(entry.request.url + '?' + entry.request.ifNoneExist)
      );
      if (existing.length === 1 && entry.fullUrl?.startsWith(uuidUriPrefix)) {
        return { placeholder: entry.fullUrl, reference: getReferenceString(existing[0]) };
      }
    }
    if (entry.resource && entry.fullUrl?.startsWith(uuidUriPrefix)) {
      entry.resource.id = this.repo.generateId();
      return {
        placeholder: entry.fullUrl,
        reference: getReferenceString(entry.resource),
      };
    }
    return undefined;
  }

  private async resolveModificationIdentity(
    entry: BundleEntry,
    path: string
  ): Promise<BundleEntryIdentity | undefined> {
    if (entry.request?.url?.includes('?') && entry.fullUrl?.startsWith(uuidUriPrefix)) {
      const method = entry.request.method;

      // Resolve conditional update via search
      const resolved = await this.repo.searchResources(parseSearchRequest(entry.request.url));
      if (resolved.length !== 1) {
        if (resolved.length === 0 && method === 'DELETE') {
          return undefined;
        }

        if (resolved.length === 0 && method === 'PUT') {
          if (entry.resource) {
            if (entry.resource.id) {
              throw new OperationOutcomeError(badRequest('Cannot provide ID for create by update'));
            }

            entry.resource.id = this.repo.generateId();
            return {
              placeholder: entry.fullUrl,
              reference: getReferenceString(entry.resource),
            };
          }
          return undefined;
        }

        throw new OperationOutcomeError(
          badRequest(`Conditional ${entry.request.method} matched ${resolved.length} resources`, path + '.request.url')
        );
      }

      const reference = getReferenceString(resolved[0]);
      entry.request.url = reference;
      return { placeholder: entry.fullUrl, reference };
    }

    if (entry.request?.url.includes('/')) {
      return { placeholder: entry.request.url, reference: entry.request.url };
    }
    return undefined;
  }

  /**
   * Processes a FHIR batch request.
   * @param bundleInfo - The preprocessed Bundle information.
   * @param resultEntries - The array of results.
   * @returns The bundle response.
   */
  private async processBatch(
    bundleInfo: BundlePreprocessInfo,
    resultEntries: (BundleEntry | OperationOutcome)[]
  ): Promise<Bundle> {
    const bundleType = this.bundle.type;

    const entries = this.bundle.entry;
    if (!entries) {
      throw new OperationOutcomeError(badRequest('Missing bundle entry'));
    }

    const preEvent: BatchEvent = {
      type: 'batch',
      bundleType,
      count: entries.length,
      size: JSON.stringify(this.bundle).length,
    };
    this.router.dispatchEvent(preEvent);

    let errors = 0;

    for (const entryIndex of bundleInfo.ordering) {
      const entry = this.bundle.entry?.[entryIndex] as BundleEntry;
      const rewritten = this.rewriteIdsInObject(entry);
      try {
        resultEntries[entryIndex] = await this.processBatchEntry(rewritten);
      } catch (err) {
        if (this.isTransaction()) {
          throw err;
        }

        errors++;
        resultEntries[entryIndex] = buildBundleResponse(normalizeOperationOutcome(err));
        continue;
      }
    }

    const postEvent: BatchEvent = {
      type: 'batch',
      bundleType,
      errors,
    };
    this.router.dispatchEvent(postEvent);

    return {
      resourceType: 'Bundle',
      type: `${bundleType}-response` as Bundle['type'],
      entry: resultEntries,
    };
  }

  /**
   * Processes a single entry from a FHIR batch request.
   * @param entry - The bundle entry.
   * @returns The bundle entry response.
   */
  private async processBatchEntry(entry: BundleEntry): Promise<BundleEntry> {
    const [requestPath] = splitN(entry.request?.url as string, '?', 2);
    const route = this.router.find(entry.request?.method as HttpMethod, requestPath);
    if (!route) {
      throw new OperationOutcomeError(notFound);
    }

    const request = this.parseBatchRequest(entry, route?.params);
    const [outcome, resource] = await route.handler(request, this.repo, this.router, { batch: true });

    if (!isOk(outcome) && this.isTransaction()) {
      throw new OperationOutcomeError(outcome);
    }
    return buildBundleResponse(outcome, resource);
  }

  /**
   * Constructs the equivalent HTTP request for a Bundle entry, based on its `request` field.
   * @param entry - The Bundle entry to parse.
   * @param params - Route path parameters
   * @returns The HTTP request to perform the operation specified by the given batch entry.
   */
  private parseBatchRequest(entry: BundleEntry, params?: Record<string, string>): FhirRequest {
    const request = entry.request as BundleEntryRequest;
    const headers = Object.create(null) as IncomingHttpHeaders;
    if (request.ifNoneExist) {
      headers['if-none-exist'] = request.ifNoneExist;
    }
    if (request.ifMatch) {
      headers['if-match'] = request.ifMatch;
    }
    if (request.ifNoneMatch) {
      headers['if-none-match'] = request.ifNoneMatch;
    }
    if (request.ifModifiedSince) {
      headers['if-modified-since'] = request.ifModifiedSince;
    }

    let body;
    if (request.method === 'PATCH') {
      body = this.parsePatchBody(entry);
    } else {
      body = entry.resource;
    }

    const url = new URL(request.url as string, 'https://example.com/');
    return {
      method: request.method as HttpMethod,
      pathname: url.pathname,
      params: params ?? Object.create(null),
      query: Object.fromEntries(url.searchParams),
      body,
      headers,
    };
  }

  private parsePatchBody(entry: BundleEntry): any {
    const patchResource = entry.resource;
    if (patchResource?.resourceType !== 'Binary') {
      throw new OperationOutcomeError(badRequest('Patch operation must include a Binary resource'));
    }
    if (!patchResource.data) {
      throw new OperationOutcomeError(badRequest('Missing entry.resource.data'));
    }

    const body = JSON.parse(Buffer.from(patchResource.data, 'base64').toString('utf8'));
    if (!Array.isArray(body)) {
      throw new OperationOutcomeError(badRequest('Patch operation body must be an array'));
    }

    return this.rewriteIdsInArray(body);
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
    const match = localBundleReference.exec(input);
    if (match) {
      if (!this.isTransaction()) {
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

  private isTransaction(): boolean {
    return this.bundle.type === 'transaction' && Boolean(this.req.config?.transactions);
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
  count?: number;
  errors?: number;
  size?: number;
}

export interface LogEvent extends Event {
  message: string;
  data?: Record<string, any>;
}
