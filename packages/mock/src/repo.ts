import { evalFhirPath, Filter, Operator, SearchRequest } from '@medplum/core';
import { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';

export class MemoryRepository {
  readonly #resources: Record<string, Record<string, Resource>>;
  readonly #history: Record<string, Record<string, Resource[]>>;

  constructor() {
    this.#resources = {};
    this.#history = {};
  }

  createResource<T extends Resource>(resource: T): T {
    const result = resource;

    if (!result.id) {
      result.id = this.generateId();
    }

    if (!result.meta) {
      result.meta = {};
    }

    if (!result.meta?.versionId) {
      result.meta.versionId = this.generateId();
    }

    const { resourceType, id } = resource as { resourceType: string; id: string };

    if (!(resourceType in this.#resources)) {
      this.#resources[resourceType] = {};
    }

    if (!(resourceType in this.#history)) {
      this.#history[resourceType] = {};
    }

    if (!(id in this.#history[resourceType])) {
      this.#history[resourceType][id] = [];
    }

    this.#resources[resourceType][id] = resource;
    this.#history[resourceType][id].push(result);
    return result;
  }

  readResource<T extends Resource>(resourceType: string, id: string): T | undefined {
    return this.#resources?.[resourceType]?.[id] as T | undefined;
  }

  readHistory<T extends Resource>(resourceType: string, id: string): Bundle<T> {
    return {
      resourceType: 'Bundle',
      type: 'history',
      entry: ((this.#history?.[resourceType]?.[id] ?? []) as T[])
        .sort(
          (version1, version2) =>
            -(version1.meta?.lastUpdated?.localeCompare(version2.meta?.lastUpdated as string) as number)
        )
        .map((version) => ({ resource: version })),
    };
  }

  readVersion<T extends Resource>(resourceType: string, id: string, versionId: string): T | undefined {
    return this.#history?.[resourceType]?.[id]?.find((v) => v.meta?.versionId === versionId) as T | undefined;
  }

  search<T extends Resource>(searchRequest: SearchRequest): Bundle<T> {
    const { resourceType } = searchRequest;
    const resources = this.#resources[resourceType] ?? {};
    const result = Object.values(resources).filter((resource) => matchesSearchRequest(resource, searchRequest));
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: result.map((resource) => ({ resource })) as BundleEntry<T>[],
      total: result.length,
    };
  }

  deleteResource(resourceType: string, id: string): void {
    if (this.#resources?.[resourceType]?.[id]) {
      delete this.#resources[resourceType][id];
    }
  }

  private generateId(): string {
    return Date.now().toString(36);
  }
}

/**
 * Determines if the resource matches the search request.
 * @param resource The resource that was created or updated.
 * @param searchRequest The subscription criteria as a search request.
 * @returns True if the resource satisfies the search request.
 */
export function matchesSearchRequest(resource: Resource, searchRequest: SearchRequest): boolean {
  if (searchRequest.resourceType !== resource.resourceType) {
    return false;
  }
  if (searchRequest.filters) {
    for (const filter of searchRequest.filters) {
      if (!matchesSearchFilter(resource, filter)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Determines if the resource matches the search filter.
 * @param resource The resource that was created or updated.
 * @param filter One of the filters of a subscription criteria.
 * @returns True if the resource satisfies the search filter.
 */
function matchesSearchFilter(resource: Resource, filter: Filter): boolean {
  for (const filterValue of filter.value.split(',')) {
    if (matchesSearchFilterValue(resource, filter, filterValue)) {
      return true;
    }
  }
  return false;
}

function matchesSearchFilterValue(resource: Resource, filter: Filter, filterValue: string): boolean {
  const expression = filter.code.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const values = evalFhirPath(expression as string, resource);
  const result = values.some((value) => JSON.stringify(value).toLowerCase().includes(filterValue.toLowerCase()));
  return filter.operator === Operator.NOT_EQUALS ? !result : result;
}
