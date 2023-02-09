import { badRequest, deepClone, matchesSearchRequest, notFound, SearchRequest } from '@medplum/core';
import { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';
import { applyPatch, Operation } from 'rfc6902';

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
    const patchErrors = applyPatch(resource, patch);
    for (const error of patchErrors) {
      if (error) {
        const message = error.message?.split('\n')?.[0] || 'JSONPatch error';
        throw badRequest(message);
      }
    }
    return this.updateResource(resource);
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
