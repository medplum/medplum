import {
  OperationOutcomeError,
  SearchRequest,
  SortRule,
  allOk,
  badRequest,
  created,
  deepClone,
  evalFhirPath,
  generateId,
  globalSchema,
  matchesSearchRequest,
  multipleMatches,
  normalizeOperationOutcome,
  notFound,
  preconditionFailed,
} from '@medplum/core';
import { Bundle, BundleEntry, OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import { Operation, applyPatch } from 'rfc6902';

export type CreateResourceOptions = {
  assignedId?: boolean;
};

export type UpdateResourceOptions = {
  ifMatch?: string;
};

/**
 * The FhirRepository abstract class defines the methods that are required to implement a FHIR repository.
 * A FHIR repository is responsible for storing and retrieving FHIR resources.
 * It is used by the FHIR router to implement the FHIR REST API.
 * The primary implementations at this time are:
 *  1. MemoryRepository - A repository that stores resources in memory.
 *  2. Server Repository - A repository that stores resources in a relational database.
 * Additionally, several convenience method implementations are provided to offer advanced functionality on top of the
 * abstract basic operations.
 */
export abstract class FhirRepository<TClient = unknown> {
  /**
   * Creates a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#create
   * @param resource - The FHIR resource to create.
   * @returns The created resource.
   */
  abstract createResource<T extends Resource>(resource: T, options?: CreateResourceOptions): Promise<T>;

  /**
   * Generates a new unique ID for a resource.
   *
   * See: https://www.hl7.org/fhir/R4/resource.html#id
   * @returns The ID string.
   */
  abstract generateId(): string;

  /**
   * Reads a FHIR resource by ID.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @returns The FHIR resource.
   */
  abstract readResource<T extends Resource>(resourceType: string, id: string): Promise<T>;

  /**
   * Reads a FHIR resource by reference.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   * @param reference - The FHIR reference.
   * @returns The FHIR resource.
   */
  abstract readReference<T extends Resource>(reference: Reference<T>): Promise<T>;

  /**
   * Reads a collection of FHIR resources by reference.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   * @param references - The FHIR references.
   * @returns The FHIR resources.
   */
  abstract readReferences(references: readonly Reference[]): Promise<(Resource | Error)[]>;

  /**
   * Returns resource history.
   *
   * Results are sorted with oldest versions last
   *
   * See: https://www.hl7.org/fhir/http.html#history
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @returns Operation outcome and a history bundle.
   */
  abstract readHistory<T extends Resource>(resourceType: string, id: string): Promise<Bundle<T>>;

  /**
   * Reads a FHIR resource version.
   *
   * See: https://www.hl7.org/fhir/http.html#vread
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @param vid - The FHIR resource version ID.
   */
  abstract readVersion<T extends Resource>(resourceType: string, id: string, vid: string): Promise<T>;

  /**
   * Updates a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#update
   * @param resource - The FHIR resource to update.
   * @returns The updated resource.
   */
  abstract updateResource<T extends Resource>(resource: T, options?: UpdateResourceOptions): Promise<T>;

  /**
   * Deletes a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#delete
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   */
  abstract deleteResource(resourceType: string, id: string): Promise<void>;

  /**
   * Patches a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#patch
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @param patch - The JSONPatch operations.
   * @returns The patched resource.
   */
  abstract patchResource(resourceType: string, id: string, patch: Operation[]): Promise<Resource>;

  /**
   * Searches for FHIR resources.
   *
   * See: https://www.hl7.org/fhir/http.html#search
   * @param searchRequest - The FHIR search request.
   * @returns The search results.
   */
  abstract search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<T>>;

  /**
   * Runs a callback function within a transaction.
   *
   * @param callback - The callback function to be run within a transaction.
   */
  abstract withTransaction<TResult>(callback: (client: TClient) => Promise<TResult>): Promise<TResult>;

  /**
   * Searches for a single FHIR resource.
   *
   * This is a convenience method for `search()` that returns the first resource rather than a `Bundle`.
   *
   * The return value is the resource, if available; otherwise, undefined.
   *
   * See FHIR search for full details: https://www.hl7.org/fhir/search.html
   * @param searchRequest - The FHIR search request.
   * @returns Promise to the first search result or undefined.
   */
  async searchOne<T extends Resource>(searchRequest: SearchRequest<T>): Promise<T | undefined> {
    const bundle = await this.search({ ...searchRequest, count: 1 });
    return bundle.entry?.[0]?.resource as T | undefined;
  }

  /**
   * Sends a FHIR search request for an array of resources.
   *
   * This is a convenience method for `search()` that returns the resources as an array rather than a `Bundle`.
   *
   * The return value is an array of resources.
   *
   * See FHIR search for full details: https://www.hl7.org/fhir/search.html
   * @param searchRequest - The FHIR search request.
   * @returns Promise to the array of search results.
   */
  async searchResources<T extends Resource>(searchRequest: SearchRequest<T>): Promise<T[]> {
    const bundle = await this.search(searchRequest);
    return bundle.entry?.map((e) => e.resource as T) ?? [];
  }

  async conditionalCreate<T extends Resource>(
    resource: T,
    search: SearchRequest<T>,
    options?: CreateResourceOptions
  ): Promise<{ resource: T; outcome: OperationOutcome }> {
    if (search.resourceType !== resource.resourceType) {
      throw new OperationOutcomeError(badRequest('Search type must match resource type for conditional update'));
    }

    return this.withTransaction(async () => {
      const matches = await this.searchResources(search);
      if (matches.length === 1) {
        const existing = matches[0];
        if (!options?.assignedId && resource.id && resource.id !== existing.id) {
          throw new OperationOutcomeError(
            badRequest('Resource ID did not match resolved ID', resource.resourceType + '.id')
          );
        }
        return { resource: matches[0], outcome: allOk };
      } else if (matches.length > 1) {
        throw new OperationOutcomeError(multipleMatches);
      }

      resource = await this.createResource(resource, options);
      return { resource, outcome: created };
    });
  }

  async conditionalUpdate<T extends Resource>(
    resource: T,
    search: SearchRequest,
    options?: UpdateResourceOptions
  ): Promise<{ resource: T; outcome: OperationOutcome }> {
    if (search.resourceType !== resource.resourceType) {
      throw new OperationOutcomeError(badRequest('Search type must match resource type for conditional update'));
    }

    return this.withTransaction(async () => {
      const matches = await this.searchResources(search);
      if (matches.length === 0) {
        if (resource.id) {
          throw new OperationOutcomeError(
            badRequest('Cannot perform create as update with client-assigned ID', resource.resourceType + '.id')
          );
        }
        resource = await this.createResource(resource);
        return { resource, outcome: created };
      } else if (matches.length > 1) {
        throw new OperationOutcomeError(multipleMatches);
      }

      const existing = matches[0];
      if (resource.id && resource.id !== existing.id) {
        throw new OperationOutcomeError(
          badRequest('Resource ID did not match resolved ID', resource.resourceType + '.id')
        );
      }

      resource.id = existing.id;
      resource = await this.updateResource(resource, options);
      return { resource, outcome: allOk };
    });
  }
}

export class MemoryRepository extends FhirRepository {
  private readonly resources: Map<string, Map<string, Resource>>;
  private readonly history: Map<string, Map<string, Resource[]>>;

  constructor() {
    super();
    this.resources = new Map();
    this.history = new Map();
  }

  clear(): void {
    this.resources.clear();
    this.history.clear();
  }

  async createResource<T extends Resource>(resource: T): Promise<T> {
    const result = deepClone(resource);

    if (!result.id) {
      result.id = this.generateId();
    }
    if (!result.meta) {
      result.meta = {};
    }
    if (!result.meta.versionId) {
      result.meta.versionId = generateId();
    }
    if (!result.meta.lastUpdated) {
      result.meta.lastUpdated = new Date().toISOString();
    }

    const { resourceType, id } = result as { resourceType: string; id: string };

    let resources = this.resources.get(resourceType);
    if (!resources) {
      resources = new Map();
      this.resources.set(resourceType, resources);
    }
    resources.set(id, result);

    let resourceTypeHistory = this.history.get(resourceType);
    if (!resourceTypeHistory) {
      resourceTypeHistory = new Map();
      this.history.set(resourceType, resourceTypeHistory);
    }
    let resourceHistory = resourceTypeHistory.get(id);
    if (!resourceHistory) {
      resourceHistory = [];
      resourceTypeHistory.set(id, resourceHistory);
    }
    resourceHistory.push(result);

    return deepClone(result);
  }

  generateId(): string {
    return generateId();
  }

  async updateResource<T extends Resource>(resource: T, options?: UpdateResourceOptions): Promise<T> {
    resource = deepClone(resource);
    if (options?.ifMatch) {
      const existing = await this.readResource(resource.resourceType, resource.id as string);
      if (options.ifMatch !== `W/"${existing.meta?.versionId}"`) {
        throw new OperationOutcomeError(preconditionFailed);
      }
    }
    if (resource.meta) {
      if (resource.meta.versionId) {
        delete resource.meta.versionId;
      }
      if (resource.meta.lastUpdated) {
        delete resource.meta.lastUpdated;
      }
    }
    return this.createResource(resource);
  }

  async patchResource(resourceType: string, id: string, patch: Operation[]): Promise<Resource> {
    const resource = await this.readResource(resourceType, id);

    try {
      const patchResult = applyPatch(resource, patch).filter(Boolean);
      if (patchResult.length > 0) {
        throw new OperationOutcomeError(badRequest(patchResult.map((e) => (e as Error).message).join('\n')));
      }
    } catch (err) {
      throw new OperationOutcomeError(normalizeOperationOutcome(err));
    }

    return this.updateResource(resource);
  }

  async readResource<T extends Resource>(resourceType: string, id: string): Promise<T> {
    const resource = this.resources.get(resourceType)?.get(id) as T | undefined;
    if (!resource) {
      throw new OperationOutcomeError(notFound);
    }
    return deepClone(resource);
  }

  async readReference<T extends Resource>(reference: Reference<T>): Promise<T> {
    const parts = reference.reference?.split('/');
    if (!parts || parts.length !== 2) {
      throw new OperationOutcomeError(badRequest('Invalid reference'));
    }
    return this.readResource(parts[0], parts[1]);
  }

  async readReferences(references: readonly Reference[]): Promise<(Resource | OperationOutcomeError)[]> {
    return Promise.all(references.map((r) => this.readReference(r)));
  }

  async readHistory<T extends Resource>(resourceType: string, id: string): Promise<Bundle<T>> {
    await this.readResource(resourceType, id);
    return {
      resourceType: 'Bundle',
      type: 'history',
      entry: ((this.history.get(resourceType)?.get(id) ?? []) as T[])
        .reverse()
        .map((version) => ({ resource: deepClone(version) })),
    };
  }

  async readVersion<T extends Resource>(resourceType: string, id: string, versionId: string): Promise<T> {
    await this.readResource(resourceType, id);
    const version = this.history
      .get(resourceType)
      ?.get(id)
      ?.find((v) => v.meta?.versionId === versionId) as T | undefined;
    if (!version) {
      throw new OperationOutcomeError(notFound);
    }
    return deepClone(version);
  }

  async search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<T>> {
    const { resourceType } = searchRequest;
    const resources = this.resources.get(resourceType) ?? new Map();
    const result = [];
    for (const resource of resources.values()) {
      if (matchesSearchRequest(resource, searchRequest)) {
        result.push(resource);
      }
    }
    let entry = result.map((resource) => ({ resource: deepClone(resource) })) as BundleEntry<T>[];
    if (searchRequest.sortRules) {
      for (const sortRule of searchRequest.sortRules) {
        entry = entry.sort((a, b) => sortComparator(a.resource as T, b.resource as T, sortRule));
      }
    }
    if (searchRequest.offset !== undefined) {
      entry = entry.slice(searchRequest.offset);
    }
    if (searchRequest.count !== undefined) {
      entry = entry.slice(0, searchRequest.count);
    }
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      entry,
      total: result.length,
    };
  }

  async deleteResource(resourceType: string, id: string): Promise<void> {
    if (!this.resources.get(resourceType)?.get(id)) {
      throw new OperationOutcomeError(notFound);
    }
    this.resources.get(resourceType)?.delete(id);
  }

  withTransaction<TResult>(callback: (client: unknown) => Promise<TResult>): Promise<TResult> {
    // MockRepository currently does not support transactions
    console.debug('WARN: MockRepository does not support transactions');
    return callback(undefined);
  }
}

const sortComparator = <T extends Resource>(a: T, b: T, sortRule: SortRule): number => {
  const searchParam = globalSchema.types[a.resourceType]?.searchParams?.[sortRule.code];
  const expression = searchParam?.expression;
  if (!expression) {
    return 0;
  }
  const aStr = JSON.stringify(evalFhirPath(expression, a));
  const bStr = JSON.stringify(evalFhirPath(expression, b));
  return aStr.localeCompare(bStr) * (sortRule.descending ? -1 : 1);
};
