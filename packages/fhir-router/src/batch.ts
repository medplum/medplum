import {
  badRequest,
  getReferenceString,
  getStatus,
  isOk,
  OperationOutcomeError,
  parseSearchRequest,
  Event,
  normalizeOperationOutcome,
  allOk,
  notFound,
  splitN,
} from '@medplum/core';
import { Bundle, BundleEntry, BundleEntryRequest, OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { FhirResponse, FhirRouter, createResourceImpl, updateResourceImpl } from './fhirrouter';
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
  const bundleType = bundle.type;
  if (bundleType !== 'batch' && bundleType !== 'transaction') {
    throw new OperationOutcomeError(badRequest('Unrecognized bundle type: ' + bundleType));
  }
  const processor = new BatchProcessor(router, repo, bundle);
  return bundleType === 'transaction' ? repo.withTransaction(() => processor.processBatch()) : processor.processBatch();
}

const localBundleReference = /urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const uuidUriPrefix = 'urn:uuid';

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
      type: `${bundleType}-response` as any,
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
    const method = entry.request?.method;
    switch (entry.request?.method) {
      case 'POST':
        if (entry.request.ifNoneExist) {
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
        break;
      case 'DELETE':
      case 'PUT':
      case 'PATCH':
        if (entry.request?.url?.includes('?')) {
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
              badRequest(
                `Conditional ${entry.request.method} matched ${resolved.length} resources`,
                path + '.request.url'
              )
            );
          }
          const reference = getReferenceString(resolved[0]);
          entry.request.url = reference;
          return { placeholder: entry.request.url, reference };
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
    const [outcome, resource] = await this.performBatchOperation(entry);
    if (!isOk(outcome) && this.bundle.type === 'transaction') {
      throw new OperationOutcomeError(outcome);
    }
    return buildBundleResponse(outcome, resource);
  }

  private async performBatchOperation(entry: BundleEntry): Promise<FhirResponse> {
    const urlParts = splitN(entry.request?.url as string, '?', 2);
    const requestPath = urlParts[0];
    const queryParams = urlParts[1];
    const route = this.router.find(entry.request?.method as HttpMethod, requestPath);
    const params = route?.params;

    switch (route?.data?.interaction) {
      case 'delete': {
        if (!params?.id) {
          throw new OperationOutcomeError(notFound);
        }
        await this.repo.deleteResource(params.resourceType, params.id);
        return [allOk];
      }
      case 'create': {
        if (!params?.resourceType) {
          throw new OperationOutcomeError(notFound);
        }
        if (!entry.resource) {
          throw new OperationOutcomeError(badRequest('Missing resource'));
        }
        if (entry.request?.ifNoneExist) {
          const { outcome, resource } = await this.repo.conditionalCreate(
            entry.resource,
            parseSearchRequest(params.resourceType + '?' + entry.request.ifNoneExist),
            { assignedId: true }
          );
          return [outcome, resource];
        }
        return createResourceImpl(params.resourceType as ResourceType, entry.resource, this.repo, {
          assignedId: true,
        });
      }
      case 'update': {
        if (!entry.resource) {
          throw new OperationOutcomeError(badRequest('Missing resource'));
        }
        if (queryParams) {
          const { outcome, resource } = await this.repo.conditionalUpdate(
            entry.resource,
            parseSearchRequest(entry.resource.resourceType + '?' + queryParams)
          );
          return [outcome, resource];
        }
        if (!params?.id) {
          throw new OperationOutcomeError(notFound);
        }
        return updateResourceImpl(params.resourceType as ResourceType, params.id, entry.resource, this.repo, {
          ifMatch: entry.request?.ifMatch,
        });
      }
      case 'patch': {
        const patch = this.parsePatchBody(entry);
        if (!params) {
          throw new OperationOutcomeError(badRequest('Invalid URL for PATCH operation'));
        }
        const resource = await this.repo.patchResource(params.resourceType, params.id, patch);
        return [allOk, resource];
      }
      case 'read': {
        if (!params?.id) {
          throw new OperationOutcomeError(notFound);
        }
        const resource = await this.repo.readResource(params.resourceType, params.id);
        return [allOk, resource];
      }
      case 'search-type': {
        if (!params?.resourceType) {
          throw new OperationOutcomeError(notFound);
        }
        const results = await this.repo.search(parseSearchRequest(entry.request?.url as string));
        return [allOk, results];
      }
      default:
        if (route?.data?.interaction) {
          const event: LogEvent = {
            message: 'Unsupported batch entry interaction type',
            type: 'warn',
            data: { interaction: route.data.interaction, url: entry.request?.url },
          };
          this.router.dispatchEvent(event);
        }
        throw new OperationOutcomeError(notFound); // TODO
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
