import {
  ChainedSearchLink,
  Filter,
  OperationOutcomeError,
  Operator,
  SearchRequest,
  SortRule,
  badRequest,
  deepClone,
  evalFhirPath,
  generateId,
  globalSchema,
  looksLikeChain,
  matchesSearchRequest,
  normalizeOperationOutcome,
  notFound,
  parseChainedParameter,
} from '@medplum/core';
import { Bundle, BundleEntry, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import { Operation, applyPatch } from 'rfc6902';

/**
 * The FhirRepository interface defines the methods that are required to implement a FHIR repository.
 * A FHIR repository is responsible for storing and retrieving FHIR resources.
 * It is used by the FHIR router to implement the FHIR REST API.
 * The primary implementations at this time are:
 *  1. MemoryRepository - A repository that stores resources in memory.
 *  2. Server Repository - A repository that stores resources in a relational database.
 */
export interface FhirRepository {
  /**
   * Creates a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#create
   * @param resource - The FHIR resource to create.
   * @returns The created resource.
   */
  createResource<T extends Resource>(resource: T): Promise<T>;

  /**
   * Reads a FHIR resource by ID.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @returns The FHIR resource.
   */
  readResource<T extends Resource>(resourceType: string, id: string): Promise<T>;

  /**
   * Reads a FHIR resource by reference.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   * @param reference - The FHIR reference.
   * @returns The FHIR resource.
   */
  readReference<T extends Resource>(reference: Reference<T>): Promise<T>;

  /**
   * Reads a collection of FHIR resources by reference.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   * @param references - The FHIR references.
   * @returns The FHIR resources.
   */
  readReferences(references: readonly Reference[]): Promise<(Resource | Error)[]>;

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
  readHistory<T extends Resource>(resourceType: string, id: string): Promise<Bundle<T>>;

  /**
   * Reads a FHIR resource version.
   *
   * See: https://www.hl7.org/fhir/http.html#vread
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @param vid - The FHIR resource version ID.
   */
  readVersion<T extends Resource>(resourceType: string, id: string, vid: string): Promise<T>;

  /**
   * Updates a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#update
   * @param resource - The FHIR resource to update.
   * @returns The updated resource.
   */
  updateResource<T extends Resource>(resource: T): Promise<T>;

  /**
   * Deletes a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#delete
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   */
  deleteResource(resourceType: string, id: string): Promise<void>;

  /**
   * Patches a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#patch
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @param patch - The JSONPatch operations.
   * @returns The patched resource.
   */
  patchResource(resourceType: string, id: string, patch: Operation[]): Promise<Resource>;

  /**
   * Searches for FHIR resources.
   *
   * See: https://www.hl7.org/fhir/http.html#search
   * @param searchRequest - The FHIR search request.
   * @returns The search results.
   */
  search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<T>>;

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
  searchOne<T extends Resource>(searchRequest: SearchRequest<T>): Promise<T | undefined>;

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
  searchResources<T extends Resource>(searchRequest: SearchRequest<T>): Promise<T[]>;
}

export abstract class BaseRepository {
  /**
   * Searches for FHIR resources.
   *
   * See: https://www.hl7.org/fhir/http.html#search
   * @param searchRequest - The FHIR search request.
   * @returns The search results.
   */
  abstract search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<T>>;

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
}

export class MemoryRepository extends BaseRepository implements FhirRepository {
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
      result.id = generateId();
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

  updateResource<T extends Resource>(resource: T): Promise<T> {
    const result = deepClone(resource);
    if (result.meta) {
      if (result.meta.versionId) {
        delete result.meta.versionId;
      }
      if (result.meta.lastUpdated) {
        delete result.meta.lastUpdated;
      }
    }
    return this.createResource(result);
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

    // matchesSearchRequest doesnt have a handle to a repo
    // or other way of resolving the resources.
    // TODO: does passing repo to the match.ts make sense?

    // For now, to enable chained searches, we re consitute two search requests:
    // 1. to handle the non-chained
    // 2. another to handle the chained, resolving resources as required.
    const chainFilters: Filter[] = [];
    const normalFilters: Filter[] = [];

    if (searchRequest.filters) {
      for (const filter of searchRequest.filters) {
        if (looksLikeChain(filter.code)) {
          chainFilters.push(filter);
        } else {
          normalFilters.push(filter);
        }
      }
    }

    for (const resource of resources.values()) {
      const matchesChain = await this.matchesChain(resource, { ...searchRequest, filters: chainFilters });
      if (matchesChain && matchesSearchRequest(resource, { ...searchRequest, filters: normalFilters })) {
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

  private async matchesChain<T extends Resource>(resource: T, searchRequest: SearchRequest<T>): Promise<boolean> {
    let toVisit: Resource[] = [resource];
    for (const chainFilter of searchRequest.filters ?? []) {
      const chain = parseChainedParameter(searchRequest.resourceType, chainFilter.code, chainFilter.value);
      for (const link of chain.chain) {
        let nextToVisit: Resource[] = [];
        while (toVisit.length) {
          const currentResource = toVisit.pop() as Resource;
          const linkedResources = await this.resolveChainLink(currentResource, link);
          nextToVisit = nextToVisit.concat(linkedResources);
        }

        toVisit = nextToVisit;
      }
    }
    return toVisit.length > 0;
  }

  private async resolveChainLink<T extends Resource>(resource: T, link: ChainedSearchLink): Promise<Resource[]> {
    const matchingResources: Resource[] = [];
    if (link.reverse) {
      const referencedResources = this.resources.get(link.resourceType) ?? new Map<string, Resource>();
      const filters: Filter[] = [
        {
          code: link.details.columnName,
          operator: Operator.EQUALS,
          value: `${resource.resourceType}/${resource.id}`,
        },
      ];
      if (link.filter) {
        filters.push(link.filter);
      }
      const reverseLinkSearch: SearchRequest = {
        resourceType: link.resourceType as ResourceType,
        filters,
      };
      for (const referencedResource of referencedResources.values()) {
        if (matchesSearchRequest(referencedResource, reverseLinkSearch)) {
          matchingResources.push(referencedResource);
        }
      }
    } else {
      //TODO: hacky -- is there a safer way to access this?
      // look into using the search param perhaps?
      const reference = resource[link.details.columnName as keyof T] as Reference;
      const referencedResource = await this.readReference(reference);
      if (referencedResource?.resourceType === link.resourceType) {
        if (
          matchesSearchRequest(referencedResource, {
            resourceType: referencedResource.resourceType,
            filters: link.filter ? [link.filter] : [],
          })
        ) {
          matchingResources.push(referencedResource);
        }
      }
    }

    return matchingResources;
  }

  async deleteResource(resourceType: string, id: string): Promise<void> {
    if (!this.resources.get(resourceType)?.get(id)) {
      throw new OperationOutcomeError(notFound);
    }
    this.resources.get(resourceType)?.delete(id);
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
