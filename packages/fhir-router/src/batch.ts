// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  append,
  badRequest,
  Event,
  getReferenceString,
  getStatus,
  isOk,
  normalizeOperationOutcome,
  notFound,
  OperationOutcomeError,
  parseSearchRequest,
  WithId,
} from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  BundleEntryRequest,
  OperationOutcome,
  ParametersParameter,
  Resource,
} from '@medplum/fhirtypes';
import { IncomingHttpHeaders } from 'node:http';
import { FhirRequest, FhirRouteHandler, FhirRouteMetadata, FhirRouter, RestInteraction } from './fhirrouter';
import { FhirRepository } from './repo';
import { HttpMethod, RouteResult } from './urlrouter';

const maxUpdates = 50;
const maxSerializableTransactionEntries = 8;

const localBundleReference = /urn(:|%3A)uuid(:|%3A)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
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
 * @param req - The request for the batch.
 * @param repo - The FHIR repository.
 * @param router - The FHIR router.
 * @param bundle - The input bundle.
 * @returns The bundle response.
 */
export async function processBatch(
  req: FhirRequest,
  repo: FhirRepository,
  router: FhirRouter,
  bundle: Bundle
): Promise<Bundle> {
  const processor = new BatchProcessor(router, repo, bundle, req);
  return processor.run();
}

/**
 * The BatchProcessor class contains the state for processing a batch/transaction bundle.
 * In particular, it tracks rewritten IDs as necessary.
 */
class BatchProcessor {
  private readonly router: FhirRouter;
  private readonly repo: FhirRepository;
  private readonly bundle: Bundle;
  private readonly req: FhirRequest;
  private readonly resolvedIdentities: Record<string, string>;

  /**
   * Creates a batch processor.
   * @param router - The FHIR router.
   * @param repo - The FHIR repository.
   * @param bundle - The input bundle.
   * @param req - The request for the batch.
   */
  constructor(router: FhirRouter, repo: FhirRepository, bundle: Bundle, req: FhirRequest) {
    this.router = router;
    this.repo = repo;
    this.bundle = bundle;
    this.req = req;
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
      if (!interaction || !bucketedEntries[interaction]) {
        throw new OperationOutcomeError(
          badRequest(`Invalid REST interaction in batch: ${entry.request?.method} ${entry.request?.url}`)
        );
      }
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
      bucketedEntries[interaction].push(i);
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
        // Ensure that resources to be created have an ID assigned
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
    return this.router.find(entry.request?.method as HttpMethod, entry.request?.url ?? '');
  }

  private async resolveCreateIdentity(entry: BundleEntry): Promise<BundleEntryIdentity | undefined> {
    if (!entry.fullUrl?.startsWith(uuidUriPrefix)) {
      return undefined;
    }

    const placeholder = entry.fullUrl;
    if (entry.request?.ifNoneExist) {
      const existing = await this.repo.searchResources(
        parseSearchRequest(entry.request.url + '?' + entry.request.ifNoneExist)
      );
      if (existing.length === 1) {
        return { placeholder, reference: getReferenceString(existing[0]) };
      }
    }
    if (entry.resource) {
      entry.resource.id = this.repo.generateId();
      return { placeholder, reference: getReferenceString(entry.resource as WithId<Resource>) };
    }
    return undefined;
  }

  private async resolveModificationIdentity(
    entry: BundleEntry,
    path: string
  ): Promise<BundleEntryIdentity | undefined> {
    if (!entry.fullUrl?.startsWith(uuidUriPrefix)) {
      return undefined;
    }

    const placeholder = entry.fullUrl;
    if (entry.request?.url?.includes('?')) {
      const method = entry.request.method;

      // Resolve conditional update via search
      const searchReq = parseSearchRequest(entry.request.url);
      searchReq.count = 2;
      searchReq.offset = 0;
      searchReq.sortRules = undefined;

      const [resolved, duplicate] = await this.repo.searchResources(searchReq);
      if (!resolved) {
        switch (method) {
          case 'DELETE':
            // DELETE is idempotent; it succeeds if the resource already doesn't exist
            return undefined;
          case 'PUT':
            // Upsert (Update as Create): https://www.hl7.org/fhir/http.html#upsert
            if (entry.resource) {
              if (entry.resource.id) {
                throw new OperationOutcomeError(badRequest('Cannot provide ID for create by update'));
              }

              entry.resource.id = this.repo.generateId();
              return { placeholder, reference: getReferenceString(entry.resource as WithId<Resource>) };
            }
            return undefined;
          default:
            throw new OperationOutcomeError(
              badRequest(`Conditional ${entry.request.method} did not match any resources`, path + '.request.url')
            );
        }
      }
      if (duplicate) {
        throw new OperationOutcomeError(
          badRequest(`Conditional ${entry.request.method} matched multiple resources`, path + '.request.url')
        );
      }

      const reference = getReferenceString(resolved);
      entry.request.url = reference;
      if (entry.resource) {
        entry.resource.id = resolved.id;
      }
      return { placeholder, reference };
    }

    if (entry.request?.url.includes('/')) {
      return { placeholder, reference: entry.request.url };
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

    let errors: string[] | undefined;
    for (let n = 0; n < bundleInfo.ordering.length; n++) {
      const entryIndex = bundleInfo.ordering[n];
      const entry = entries[entryIndex];
      const rewritten = this.rewriteIdsInObject(entry);
      try {
        resultEntries[entryIndex] = await this.processBatchEntry(rewritten);
      } catch (err: any) {
        if (this.isTransaction()) {
          throw err;
        }

        errors = append(errors, err.message);
        if (err instanceof OperationOutcomeError && getStatus(err.outcome) === 429) {
          // Rate limit reached; terminate batch and finish to avoid further load on server
          for (let i = n; i < bundleInfo.ordering.length; i++) {
            const entryIndex = bundleInfo.ordering[i];
            resultEntries[entryIndex] = buildBundleResponse(err.outcome);
          }
          break;
        }

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
    const route = this.getRouteForEntry(entry);
    if (!route) {
      throw new OperationOutcomeError(notFound);
    }

    const request = this.parseBatchRequest(entry, route);
    const [outcome, resource] = await route.handler(request, this.repo, this.router, { batch: true });

    if (!isOk(outcome) && this.isTransaction()) {
      throw new OperationOutcomeError(outcome);
    }
    return buildBundleResponse(outcome, resource);
  }

  /**
   * Constructs the equivalent HTTP request for a Bundle entry, based on its `request` field.
   * @param entry - The Bundle entry to parse.
   * @param route - The route associated with the request.
   * @returns The HTTP request to perform the operation specified by the given batch entry.
   */
  private parseBatchRequest(entry: BundleEntry, route?: RouteResult<FhirRouteHandler, FhirRouteMetadata>): FhirRequest {
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

    return {
      method: request.method as HttpMethod,
      url: route?.query ? request.url.slice(0, request.url.indexOf('?')) : request.url,
      pathname: '',
      params: route?.params ?? Object.create(null),
      query: route?.query ?? Object.create(null),
      body,
      headers,
    };
  }

  private parsePatchBody(entry: BundleEntry): any {
    const patchResource = entry.resource;
    let body: any[] | undefined;
    if (patchResource?.resourceType === 'Binary') {
      if (!patchResource.data) {
        throw new OperationOutcomeError(badRequest('Missing entry.resource.data'));
      }

      body = JSON.parse(Buffer.from(patchResource.data, 'base64').toString('utf8'));
    } else if (patchResource?.resourceType === 'Parameters') {
      if (patchResource.parameter) {
        body = [];
        for (const param of patchResource.parameter) {
          if (param.name === 'operation') {
            const op = this.parsePatchParameter(param);
            body.push(op);
          }
        }
      }
    } else {
      throw new OperationOutcomeError(badRequest('Patch entry must include a Binary or Parameters resource'));
    }

    if (!Array.isArray(body)) {
      throw new OperationOutcomeError(badRequest('Decoded PATCH body must be an array'));
    }

    return this.rewriteIdsInArray(body);
  }

  private parsePatchParameter(param: ParametersParameter): Record<string, any> {
    const operation = param.part?.find((p) => p.name === 'op')?.valueCode;
    if (!operation) {
      // FHIRPatch will also use Parameters; however, it uses `name = 'type'`
      // We can use this to disambiguate the two in the future
      throw new OperationOutcomeError(badRequest('PATCH Parameters missing op'));
    }

    const op: Record<string, any> = { op: operation };
    switch (operation) {
      case 'add':
      case 'replace':
      case 'test':
        // part is guaranteed to be defined, since that's where operation was found
        for (const part of param.part as ParametersParameter[]) {
          if (part.name === 'path') {
            op.path = part.valueString;
          } else if (part.name === 'value') {
            op.value = JSON.parse(part.valueString ?? '');
          }
        }
        break;
      case 'copy':
      case 'move':
        for (const part of param.part as ParametersParameter[]) {
          if (part.name === 'path') {
            op.path = part.valueString;
          } else if (part.name === 'from') {
            op.from = part.valueString;
          }
        }
        break;
      case 'remove':
        op.path = param.part?.find((p) => p.name === 'path')?.valueString;
        break;
    }

    return op;
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
    const rewritable = localBundleReference.exec(input)?.[0];
    if (!rewritable) {
      return input;
    }

    const urn = rewritable.replaceAll('%3A', ':'); // Handle specific URL encoding for the URN format
    const referenceString = this.resolvedIdentities[urn];
    return referenceString ? input.replaceAll(rewritable, referenceString) : input;
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
  errors?: string[];
  size?: number;
}

export interface LogEvent extends Event {
  message: string;
  data?: Record<string, any>;
}
