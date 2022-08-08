import { badRequest, deepClone, evalFhirPath, Filter, notFound, Operator, SearchRequest } from '@medplum/core';
import { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
/** @ts-ignore */
import type { JsonPatchError, Operation } from 'fast-json-patch';

export class MemoryRepository {
  readonly #resources: Record<string, Record<string, Resource>>;
  readonly #history: Record<string, Record<string, Resource[]>>;

  constructor() {
    this.#resources = {};
    this.#history = {};
  }

  createResource<T extends Resource>(resource: T): T {
    const result = deepClone(resource);

    if (!result.id) {
      result.id = this.generateId();
    }

    if (!result.meta) {
      result.meta = {};
    }

    if (!result.meta?.versionId) {
      result.meta.versionId = this.generateId();
    }

    if (!result.meta?.lastUpdated) {
      result.meta.lastUpdated = new Date().toISOString();
    }

    const { resourceType, id } = result as { resourceType: string; id: string };

    if (!(resourceType in this.#resources)) {
      this.#resources[resourceType] = {};
    }

    if (!(resourceType in this.#history)) {
      this.#history[resourceType] = {};
    }

    if (!(id in this.#history[resourceType])) {
      this.#history[resourceType][id] = [];
    }

    this.#resources[resourceType][id] = result;
    this.#history[resourceType][id].push(result);
    return deepClone(result);
  }

  updateResource<T extends Resource>(resource: T): T {
    const result = JSON.parse(JSON.stringify(resource)) as T;
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
    const resource = this.readResource(resourceType, id);

    let patchResult;
    try {
      const { applyPatch } = await import('fast-json-patch');
      patchResult = applyPatch(resource, patch, true);
    } catch (err) {
      const patchError = err as JsonPatchError;
      const message = patchError.message?.split('\n')?.[0] || 'JSONPatch error';
      throw badRequest(message);
    }

    const patchedResource = patchResult.newDocument;
    return this.updateResource(patchedResource);
  }

  readResource<T extends Resource>(resourceType: string, id: string): T {
    const resource = this.#resources?.[resourceType]?.[id] as T | undefined;
    if (!resource) {
      throw notFound;
    }
    return deepClone(resource);
  }

  readHistory<T extends Resource>(resourceType: string, id: string): Bundle<T> {
    this.readResource(resourceType, id);
    return {
      resourceType: 'Bundle',
      type: 'history',
      entry: ((this.#history?.[resourceType]?.[id] ?? []) as T[])
        .reverse()
        .map((version) => ({ resource: deepClone(version) })),
    };
  }

  readVersion<T extends Resource>(resourceType: string, id: string, versionId: string): T {
    this.readResource(resourceType, id);
    const version = this.#history?.[resourceType]?.[id]?.find((v) => v.meta?.versionId === versionId) as T | undefined;
    if (!version) {
      throw notFound;
    }
    return deepClone(version);
  }

  search<T extends Resource>(searchRequest: SearchRequest): Bundle<T> {
    const { resourceType } = searchRequest;
    const resources = this.#resources[resourceType] ?? {};
    const result = Object.values(resources).filter((resource) => matchesSearchRequest(resource, searchRequest));
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: result.map((resource) => ({ resource: deepClone(resource) })) as BundleEntry<T>[],
      total: result.length,
    };
  }

  deleteResource(resourceType: string, id: string): void {
    if (this.#resources?.[resourceType]?.[id]) {
      delete this.#resources[resourceType][id];
    }
  }

  private generateId(): string {
    // Cross platform random UUID generator
    // Note that this is not intended for production use, but rather for testing
    // This should be replaced when crypto.randomUUID is fully supported
    // https://stackoverflow.com/revisions/2117523/28
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
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

  switch (filter.operator) {
    case Operator.GREATER_THAN:
      return values.some((value) => (value as any).toString() > filterValue);

    case Operator.GREATER_THAN_OR_EQUALS:
      return values.some((value) => (value as any).toString() >= filterValue);

    case Operator.LESS_THAN:
      return values.some((value) => (value as any).toString() < filterValue);

    case Operator.LESS_THAN_OR_EQUALS:
      return values.some((value) => (value as any).toString() <= filterValue);

    default: {
      const result =
        filterValue === '' ||
        values.some((value) => JSON.stringify(value).toLowerCase().includes(filterValue.toLowerCase()));
      return filter.operator === Operator.NOT_EQUALS ? !result : result;
    }
  }
}
