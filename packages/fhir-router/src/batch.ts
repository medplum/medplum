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
const maxSerializableTransactionEntries = 4;

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
  const bundleType = bundle.type;
  if (bundleType !== 'batch' && bundleType !== 'transaction') {
    throw new OperationOutcomeError(badRequest('Unrecognized bundle type: ' + bundleType));
  }
  const processor = new BatchProcessor(router, repo, bundle);
  const resultEntries: (BundleEntry | OperationOutcome)[] = new Array(bundle.entry?.length ?? 0);
  const bundleInfo = await processor.preprocessBundle(resultEntries);

  if (bundleType === 'transaction') {
    if (bundleInfo.updates > maxUpdates) {
      throw new OperationOutcomeError(badRequest('Transaction contains more update operations than allowed'));
    }
    if (bundleInfo.requiresStrongTransaction && resultEntries.length > maxSerializableTransactionEntries) {
      throw new OperationOutcomeError(badRequest('Transaction requires strict isolation but has too many entries'));
    }
    return repo.withTransaction(() => processor.processBatch(bundleInfo, resultEntries), {
      serializable: bundleInfo.requiresStrongTransaction,
    });
  } else {
    return processor.processBatch(bundleInfo, resultEntries);
  }
}

const localBundleReference = /urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const uuidUriPrefix = 'urn:uuid';

type BundleEntryIdentity = { placeholder: string; reference: string };

type BundlePreprocessInfo = {
  ordering: number[];
  requiresStrongTransaction: boolean;
  updates: number;
};

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
   * @param bundleInfo - The preprocessed Bundle information.
   * @param resultEntries - The array of results.
   * @returns The bundle response.
   */
  async processBatch(
    bundleInfo: BundlePreprocessInfo,
    resultEntries: (BundleEntry | OperationOutcome)[]
  ): Promise<Bundle> {
    const bundleType = this.bundle.type;
    let count = 0;
    let errors = 0;

    for (const entryIndex of bundleInfo.ordering) {
      const entry = this.bundle.entry?.[entryIndex] as BundleEntry;
      const rewritten = this.rewriteIdsInObject(entry);
      try {
        count++;
        resultEntries[entryIndex] = await this.processBatchEntry(rewritten);
      } catch (err) {
        if (bundleType !== 'transaction') {
          errors++;
          resultEntries[entryIndex] = buildBundleResponse(normalizeOperationOutcome(err));
          continue;
        }
        throw err;
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
      type: `${bundleType}-response` as Bundle['type'],
      entry: resultEntries,
    };
  }

  async preprocessBundle(results: BundleEntry[]): Promise<BundlePreprocessInfo> {
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
      const result = await this.preprocessEntry(entry, i, seenIdentities);
      if (result) {
        results[i] = result;
        continue;
      }
      const route = this.getRouteForEntry(entry);
      const interaction = route?.data?.interaction as RestInteraction;
      if (interaction === 'create' && entry.request?.ifNoneExist) {
        // Conditional create requires strong (serializable) transaction to
        // guarantee uniqueness of created resource
        requiresStrongTransaction = true;
      } else if (interaction === 'update') {
        updates++;
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

  private async preprocessEntry(
    entry: BundleEntry,
    index: number,
    seenIdentities: Set<string>
  ): Promise<BundleEntry | undefined> {
    if (!entry.request?.url) {
      return buildBundleResponse(badRequest('Missing Bundle entry request URL', `Bundle.entry[${index}].request.url`));
    }

    let resolved: { placeholder: string; reference: string } | undefined;
    try {
      resolved = await this.resolveIdentity(entry, `Bundle.entry[${index}]`);
    } catch (err: any) {
      if (err instanceof OperationOutcomeError && this.bundle.type !== 'transaction') {
        return buildBundleResponse(err.outcome);
      }
      throw err;
    }
    if (resolved) {
      this.resolvedIdentities[resolved.placeholder] = resolved.reference;
      if (seenIdentities.has(resolved.reference)) {
        throw new OperationOutcomeError(badRequest('Duplicate resource identity found in Bundle'));
      }
      seenIdentities.add(resolved.reference);
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
        return this.processCreate(entry);
      case 'delete':
      case 'update':
      case 'patch':
        return this.processModification(entry, path);
      default:
        // Ignore read-only and complex operations
        return undefined;
    }
  }

  private getRouteForEntry(entry: BundleEntry): RouteResult<FhirRouteHandler, FhirRouteMetadata> | undefined {
    const [requestPath] = splitN(entry.request?.url as string, '?', 2);
    return this.router.find(entry.request?.method as HttpMethod, requestPath);
  }

  private async processCreate(entry: BundleEntry): Promise<BundleEntryIdentity | undefined> {
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

  private async processModification(entry: BundleEntry, path: string): Promise<BundleEntryIdentity | undefined> {
    if (entry.request?.url?.includes('?')) {
      const method = entry.request.method;
      // Resolve conditional update via search
      const resolved = await this.repo.searchResources(parseSearchRequest(entry.request.url));
      if (resolved.length !== 1) {
        if (resolved.length === 0 && method === 'DELETE') {
          return undefined;
        }
        if (resolved.length === 0 && method === 'PUT' && !entry.resource?.id) {
          return undefined; // create by update for conditional PUT
        }
        throw new OperationOutcomeError(
          badRequest(`Conditional ${entry.request.method} matched ${resolved.length} resources`, path + '.request.url')
        );
      }
      const reference = getReferenceString(resolved[0]);
      entry.request.url = reference;
      return { placeholder: entry.request.url, reference };
    } else if (entry.request?.url.includes('/')) {
      return { placeholder: entry.request.url, reference: entry.request.url };
    }
    return undefined;
  }

  /**
   * Processes a single entry from a FHIR batch request.
   * @param entry - The bundle entry.
   * @returns The bundle entry response.
   */
  private async processBatchEntry(entry: BundleEntry): Promise<BundleEntry> {
    const [requestPath] = splitN(entry.request?.url as string, '?', 2);
    const route = this.router.find(entry.request?.method as HttpMethod, requestPath);

    const request = this.parseBatchRequest(entry, route?.params);
    const [outcome, resource] = route
      ? await route.handler(request, this.repo, this.router, { batch: true })
      : ([notFound] as [OperationOutcome]);

    if (!isOk(outcome) && this.bundle.type === 'transaction') {
      throw new OperationOutcomeError(outcome);
    }
    return buildBundleResponse(outcome, resource);
  }

  parseBatchRequest(entry: BundleEntry, params?: Record<string, string>): FhirRequest {
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
