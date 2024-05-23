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
import { FhirRequest, FhirResponse, FhirRouter } from './fhirrouter';
import { FhirRepository } from './repo';
import { HttpMethod } from './urlrouter';
import { IncomingHttpHeaders } from 'node:http';

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
  return bundleType === 'transaction' ? repo.withTransaction(() => processor.processBatch()) : processor.processBatch();
}

const localBundleReference = /urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const uuidUriPrefix = 'urn:uuid';

type BundleEntryIdentity = { placeholder: string; reference: string };

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
      const result = await this.preprocessEntry(entry, i, seenIdentities);
      if (result) {
        results[i] = result;
        continue;
      }
      bucketedEntries[method]?.push(i);
    }

    const result = [];
    for (const bucket of Object.values(bucketedEntries)) {
      result.push(...bucket);
    }
    return result;
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
    switch (entry.request?.method) {
      case 'POST':
        return this.processCreate(entry);
      case 'DELETE':
      case 'PUT':
      case 'PATCH':
        return this.processModification(entry, path);
      case 'GET':
      case 'HEAD':
        // Ignore read-only requests
        return undefined;
      default:
        throw new OperationOutcomeError(
          badRequest('Invalid batch request method: ' + entry.request?.method, path + '.request.method')
        );
    }
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
    const [outcome, resource] = await this.performBatchOperation(entry);
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

  private async performBatchOperation(entry: BundleEntry): Promise<FhirResponse> {
    const [requestPath] = splitN(entry.request?.url as string, '?', 2);
    const route = this.router.find(entry.request?.method as HttpMethod, requestPath);

    const request = this.parseBatchRequest(entry, route?.params);
    const response = route
      ? await route.handler(request, this.repo, this.router, { batch: true })
      : ([notFound] as [OperationOutcome]);
    return response;
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
