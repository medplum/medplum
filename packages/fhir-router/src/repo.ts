// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, IncludeTarget, SearchRequest, SortRule, WithId } from '@medplum/core';
import {
  EMPTY,
  OperationOutcomeError,
  Operator,
  PropertyType,
  SearchParameterType,
  allOk,
  badRequest,
  created,
  deepClone,
  evalFhirPath,
  evalFhirPathTyped,
  generateId,
  getReferenceString,
  getSearchParameter,
  getSearchParameterDetails,
  globalSchema,
  matchesSearchRequest,
  multipleMatches,
  normalizeOperationOutcome,
  notFound,
  preconditionFailed,
  stringify,
  toTypedValue,
  tryGetDataType,
  validateResource,
} from '@medplum/core';
import type { Bundle, BundleEntry, OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import type { Operation } from 'rfc6902';
import { applyPatch } from 'rfc6902';

export type CreateResourceOptions = {
  assignedId?: boolean;
};

export type UpdateResourceOptions = {
  ifMatch?: string;
};

export type ReadHistoryOptions = {
  offset?: number;
  limit?: number;
};

export const RepositoryMode = {
  READER: 'reader',
  WRITER: 'writer',
} as const;
export type RepositoryMode = (typeof RepositoryMode)[keyof typeof RepositoryMode];

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
   * Sets the repository mode.
   * In general, it is assumed that repositories will start in "reader" mode,
   * and that the mode will be changed to "writer" as needed.
   * It is recommended that the repository use "reader" opportunistically,
   * but after using "writer" once it should use "writer" exclusively.
   * @param mode - The repository mode.
   */
  abstract setMode(mode: RepositoryMode): void;

  /**
   * Creates a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#create
   * @param resource - The FHIR resource to create.
   * @returns The created resource.
   */
  abstract createResource<T extends Resource>(resource: T, options?: CreateResourceOptions): Promise<WithId<T>>;

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
  abstract readResource<T extends Resource>(resourceType: string, id: string): Promise<WithId<T>>;

  /**
   * Reads a FHIR resource by reference.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   * @param reference - The FHIR reference.
   * @returns The FHIR resource.
   */
  abstract readReference<T extends Resource>(reference: Reference<T>): Promise<WithId<T>>;

  /**
   * Reads a collection of FHIR resources by reference.
   *
   * See: https://www.hl7.org/fhir/http.html#read
   * @param references - The FHIR references.
   * @returns The FHIR resources.
   */
  abstract readReferences<T extends Resource>(references: readonly Reference<T>[]): Promise<(T | Error)[]>;

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
  abstract readHistory<T extends Resource>(
    resourceType: string,
    id: string,
    options?: ReadHistoryOptions
  ): Promise<Bundle<WithId<T>>>;

  /**
   * Reads a FHIR resource version.
   *
   * See: https://www.hl7.org/fhir/http.html#vread
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @param vid - The FHIR resource version ID.
   */
  abstract readVersion<T extends Resource>(resourceType: string, id: string, vid: string): Promise<WithId<T>>;

  /**
   * Updates a FHIR resource.
   *
   * See: https://www.hl7.org/fhir/http.html#update
   * @param resource - The FHIR resource to update.
   * @returns The updated resource.
   */
  abstract updateResource<T extends Resource>(resource: T, options?: UpdateResourceOptions): Promise<WithId<T>>;

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
  abstract patchResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    patch: Operation[]
  ): Promise<WithId<T>>;

  /**
   * Searches for FHIR resources.
   *
   * See: https://www.hl7.org/fhir/http.html#search
   * @param searchRequest - The FHIR search request.
   * @returns The search results.
   */
  abstract search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<WithId<T>>>;

  /**
   * Searches for FHIR resources by reference.
   *
   * This is an advanced operation that is primarily used to optimize GraphQL resolvers that need to search for resources by reference.
   *
   * @param searchRequest - The FHIR search request.
   * @param referenceField - The name of the reference field to search by (e.g. "patient" or "subject").
   * @param references - The reference values to search for (e.g. ["Patient/123", "Patient/456"]).
   * @returns A record mapping reference values to the resources that reference them (e.g. \{ "Patient/123": [Observation1, Observation2], "Patient/456": [Observation3] \}).
   */
  abstract searchByReference<T extends Resource>(
    searchRequest: SearchRequest<T>,
    referenceField: string,
    references: string[]
  ): Promise<Record<string, WithId<T>[]>>;

  /**
   * Runs a callback function within a transaction.
   *
   * @param callback - The callback function to be run within a transaction.
   */
  abstract withTransaction<TResult>(
    callback: (client: TClient) => Promise<TResult>,
    options?: { serializable?: boolean }
  ): Promise<TResult>;

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
  async searchOne<T extends Resource>(searchRequest: SearchRequest<T>): Promise<WithId<T> | undefined> {
    const bundle = await this.search({ ...searchRequest, count: 1 });
    return bundle.entry?.[0]?.resource;
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
  async searchResources<T extends Resource>(searchRequest: SearchRequest<T>): Promise<WithId<T>[]> {
    const bundle = await this.search(searchRequest);
    return bundle.entry?.map((e) => e.resource as WithId<T>) ?? [];
  }

  /**
   * Conditionally creates a FHIR resource.
   *
   * The action it takes depends on how many matches are found:
   *
   *   1. No matches: The server processes the create as above
   *   2. One Match: The server ignores the post and returns 200 OK
   *   3. Multiple matches: The server returns a 412 Precondition Failed error indicating the client's criteria were not selective enough
   *
   * See: https://hl7.org/fhir/R4/http.html#ccreate
   *
   * @param resource - The FHIR resource to create.
   * @param search - The "If-None-Exist" search criteria to determine if the resource already exists.
   * @param options - Additional options for resource creation.
   * @returns A promise resolving to the created resource and the operation outcome.
   */
  async conditionalCreate<T extends Resource>(
    resource: T,
    search: SearchRequest<T>,
    options?: CreateResourceOptions
  ): Promise<{ resource: WithId<T>; outcome: OperationOutcome }> {
    if (search.resourceType !== resource.resourceType) {
      throw new OperationOutcomeError(badRequest('Search type must match resource type for conditional update'));
    }

    // Limit search to optimize DB query
    search.count = 2;
    search.sortRules = undefined;

    return this.withTransaction(
      async () => {
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

        const createdResource = await this.createResource(resource, options);
        return { resource: createdResource, outcome: created };
      },
      { serializable: true } // Requires strong transactional guarantees to ensure unique resource creation
    );
  }

  /**
   * Conditionally updates a FHIR resource.
   *
   * The action it takes depends on how many matches are found:
   *
   *   1. No matches, no id provided: The server creates the resource.
   *   2. No matches, id provided: The server treats the interaction as an Update as Create interaction (or rejects it, if it does not support Update as Create)
   *   3. One Match, no resource id provided OR (resource id provided and it matches the found resource): The server performs the update against the matching resource
   *   4. One Match, resource id provided but does not match resource found: The server returns a 400 Bad Request error indicating the client id specification was a problem preferably with an OperationOutcome
   *   5. Multiple matches: The server returns a 412 Precondition Failed error indicating the client's criteria were not selective enough preferably with an OperationOutcome
   *
   * See: https://hl7.org/fhir/R4/http.html#cond-update
   *
   * @param resource - The FHIR resource to update.
   * @param search - The "If-Exist" search criteria to determine if the resource already exists.
   * @param options - Additional options for resource update.
   * @returns A promise resolving to the updated resource and the operation outcome.
   */
  async conditionalUpdate<T extends Resource>(
    resource: T,
    search: SearchRequest,
    options?: CreateResourceOptions & UpdateResourceOptions
  ): Promise<{ resource: WithId<T>; outcome: OperationOutcome }> {
    if (search.resourceType !== resource.resourceType) {
      throw new OperationOutcomeError(badRequest('Search type must match resource type for conditional update'));
    }

    // Limit search to optimize DB query
    search.count = 2;
    search.sortRules = undefined;

    return this.withTransaction(
      async () => {
        const matches = await this.searchResources(search);
        if (matches.length === 0) {
          if (resource.id && !options?.assignedId) {
            throw new OperationOutcomeError(
              badRequest('Cannot perform create as update with client-assigned ID', resource.resourceType + '.id')
            );
          }
          const createdResource = await this.createResource(resource, options);
          return { resource: createdResource, outcome: created };
        } else if (matches.length > 1) {
          throw new OperationOutcomeError(multipleMatches);
        }

        const existing = matches[0];
        if (resource.id && resource.id !== existing.id) {
          throw new OperationOutcomeError(
            badRequest('Resource ID did not match resolved ID', resource.resourceType + '.id')
          );
        }

        const updated = await this.updateResource({ ...resource, id: existing.id }, options);
        return { resource: updated, outcome: allOk };
      },
      { serializable: true }
    );
  }

  /**
   * Conditionally deletes a FHIR resource.
   *
   * The action it takes depends on how many matches are found:
   *
   *   1. No matches or One Match: The server performs an ordinary delete on the matching resource
   *   2. Multiple matches: A server may choose to delete all the matching resources, or it may choose to return a 412 Precondition Failed error indicating the client's criteria were not selective enough.
   *
   * See: https://hl7.org/fhir/R4/http.html#3.1.0.7.1
   *
   * @param search - The "If-Exist" search criteria to determine which resource(s) to delete.
   * @returns A promise that resolves when the operation is complete.
   */
  async conditionalDelete(search: SearchRequest): Promise<void> {
    // Limit search to optimize DB query
    search.count = 2;
    search.sortRules = undefined;

    await this.withTransaction(
      async () => {
        const matches = await this.searchResources(search);
        if (matches.length > 1) {
          throw new OperationOutcomeError(multipleMatches);
        } else if (!matches.length) {
          return;
        }

        const resource = matches[0];
        await this.deleteResource(resource.resourceType, resource.id);
      },
      { serializable: true }
    );
  }

  async conditionalPatch(search: SearchRequest, patch: Operation[]): Promise<WithId<Resource>> {
    // Limit search to optimize DB query
    search.count = 2;
    search.sortRules = undefined;

    return this.withTransaction(
      async () => {
        const matches = await this.searchResources(search);
        if (matches.length > 1) {
          throw new OperationOutcomeError(multipleMatches);
        } else if (!matches.length) {
          throw new OperationOutcomeError(notFound);
        }

        const resource = matches[0];
        return this.patchResource(resource.resourceType, resource.id, patch);
      },
      { serializable: true }
    );
  }
}

export interface MemoryRepositoryOptions {
  /**
   * When true, `createResource` and `updateResource` will run `validateResource`
   * against any resource whose StructureDefinition is loaded into the global
   * schema, rejecting invalid inputs with `OperationOutcomeError`. Defaults to
   * `false` for backwards compatibility — opt in to mirror server-side
   * validation behavior in unit tests.
   */
  readonly validateResources?: boolean;
}

export class MemoryRepository extends FhirRepository<undefined> {
  private readonly resources: Map<string, Map<string, Resource>>;
  private readonly history: Map<string, Map<string, Resource[]>>;
  private seeding: boolean;
  private readonly validateResources: boolean;

  constructor(options?: MemoryRepositoryOptions) {
    super();
    this.resources = new Map();
    this.history = new Map();
    this.seeding = false;
    this.validateResources = options?.validateResources ?? false;
  }

  // Puts this repository into "seeding" mode, during which time
  // you can specify meta information that normally would not be
  // permissible.
  async withSeeding<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.seeding) {
      // We're nested inside another seeding block, just run the callback
      // without changing state
      return fn();
    }

    this.seeding = true;
    const result = await fn();
    this.seeding = false;
    return result;
  }

  clear(): void {
    this.resources.clear();
    this.history.clear();
  }

  setMode(_mode: RepositoryMode): void {
    // MockRepository ignores reader/writer mode
  }

  async createResource<T extends Resource>(
    resource: T,
    options?: CreateResourceOptions,
    update: boolean = false
  ): Promise<WithId<T>> {
    //simulate round-tripping through a JSON serialized format
    const parsed = JSON.parse(stringify(resource)) as T;
    const result = {
      ...parsed,
      id: parsed.id ?? this.generateId(),
      meta: parsed.meta ?? {},
    };

    if (!this.seeding) {
      if (result.meta.versionId) {
        delete result.meta.versionId;
      }
      if (result.meta.lastUpdated) {
        delete result.meta.lastUpdated;
      }
    }

    result.meta.versionId ??= generateId();
    result.meta.lastUpdated ??= new Date().toISOString();

    const { resourceType, id } = result;

    if (this.validateResources && !this.seeding && tryGetDataType(resourceType)) {
      validateResource(result);
    }

    let resources = this.resources.get(resourceType);
    if (!resources) {
      resources = new Map();
      this.resources.set(resourceType, resources);
    }

    if (!update && resources.has(id)) {
      throw new OperationOutcomeError(badRequest('Assigned ID is already in use'));
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

  updateResource<T extends Resource>(resource: T, options?: UpdateResourceOptions): Promise<WithId<T>> {
    if (!resource.id) {
      throw new OperationOutcomeError(badRequest('Missing id'));
    }

    if (options?.ifMatch) {
      const versionId = options.ifMatch;
      const existing = this.resources.get(resource.resourceType)?.get(resource.id) as T | undefined;
      if (!existing) {
        throw new OperationOutcomeError(notFound);
      }

      if (existing.meta?.versionId !== versionId) {
        throw new OperationOutcomeError(preconditionFailed);
      }
    }

    return this.createResource(resource, undefined, true);
  }

  async patchResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    patch: Operation[]
  ): Promise<WithId<T>> {
    const resource = await this.readResource<T>(resourceType, id);

    try {
      const patchResult = applyPatch(resource, patch).filter(Boolean);
      if (patchResult.length > 0) {
        throw new OperationOutcomeError(badRequest(patchResult.map((e) => (e as Error).message).join('\n')));
      }
    } catch (err) {
      throw new OperationOutcomeError(normalizeOperationOutcome(err));
    }

    // ensure that even when in "seeding" mode calls to patchResource
    // generate new version numbers and timestamps instead of recycling
    // the previous version's
    if (resource.meta) {
      delete resource.meta.versionId;
      delete resource.meta.lastUpdated;
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

  async readReference<T extends Resource>(reference: Reference<T>): Promise<WithId<T>> {
    const parts = reference.reference?.split('/');
    if (parts?.length !== 2) {
      throw new OperationOutcomeError(badRequest('Invalid reference'));
    }
    return this.readResource(parts[0], parts[1]);
  }

  async readReferences<T extends Resource>(
    references: readonly Reference<T>[]
  ): Promise<(T | OperationOutcomeError)[]> {
    return Promise.all(references.map((r) => this.readReference<T>(r)));
  }

  async readHistory<T extends Resource>(resourceType: string, id: string): Promise<Bundle<T>> {
    await this.readResource(resourceType, id);
    const entry = ((this.history.get(resourceType)?.get(id) ?? []) as T[])
      .reverse()
      .map((version) => ({ resource: deepClone(version) }));
    return {
      resourceType: 'Bundle',
      type: 'history',
      ...(entry.length ? { entry } : undefined),
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

  async search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<WithId<T>>> {
    const { resourceType } = searchRequest;
    const resources = this.resources.get(resourceType) ?? new Map();

    const chained = await this.expandChainedFilters(searchRequest);
    if (!chained) {
      // A chained filter resolved to zero matches, so the whole search is empty.
      return { resourceType: 'Bundle', type: 'searchset', total: 0 };
    }
    const expandedRequest = await this.expandValueSetFilters(chained);

    const result = [];
    for (const resource of resources.values()) {
      if (matchesSearchRequest(resource, expandedRequest)) {
        result.push(resource);
      }
    }
    let entry: BundleEntry<WithId<T>>[] = result.map((resource) => ({ resource: deepClone(resource) }));
    for (const sortRule of searchRequest.sortRules ?? EMPTY) {
      entry = entry.sort((a, b) => sortComparator(a.resource as T, b.resource as T, sortRule));
    }
    if (searchRequest.offset !== undefined) {
      entry = entry.slice(searchRequest.offset);
    }
    if (searchRequest.count !== undefined) {
      entry = entry.slice(0, searchRequest.count);
    }

    const hasIncludes = (searchRequest.include?.length ?? 0) > 0 || (searchRequest.revInclude?.length ?? 0) > 0;
    if (hasIncludes) {
      for (const e of entry) {
        e.search = { mode: 'match' };
      }
      await this.resolveIncludes(searchRequest, entry);
    }

    return {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: entry.length ? entry : undefined,
      total: result.length,
    };
  }

  /**
   * Rewrites `:in` / `:not-in` filters into plain token equality / inequality
   * filters by expanding the referenced ValueSet to its (system|code) members.
   *
   * If the referenced ValueSet cannot be resolved a `badRequest` is thrown,
   * matching server behavior. Hierarchical token modifiers `:above` / `:below`
   * still require a real terminology service and remain unsupported.
   * @param searchRequest - A search request potentially containing IN / NOT_IN filters.
   * @returns The same request with any IN / NOT_IN filters rewritten in place.
   */
  private async expandValueSetFilters<T extends Resource>(searchRequest: SearchRequest<T>): Promise<SearchRequest<T>> {
    const filters = searchRequest.filters ?? EMPTY;
    let needsExpansion = false;
    for (const f of filters) {
      if (f.operator === Operator.IN || f.operator === Operator.NOT_IN) {
        needsExpansion = true;
        break;
      }
    }
    if (!needsExpansion) {
      return searchRequest;
    }

    const newFilters: Filter[] = [];
    for (const filter of filters) {
      if (filter.operator !== Operator.IN && filter.operator !== Operator.NOT_IN) {
        newFilters.push(filter);
        continue;
      }
      const tokens = await this.expandValueSetCodes(filter.value);
      const negated = filter.operator === Operator.NOT_IN;
      if (tokens.length === 0) {
        // IN of an empty ValueSet matches nothing; fall back to a tautologically-false filter.
        // NOT_IN of an empty ValueSet matches everything; emit a missing=false filter to keep it true.
        newFilters.push(
          negated
            ? { code: filter.code, operator: Operator.PRESENT, value: 'true' }
            : { code: filter.code, operator: Operator.MISSING, value: 'true' }
        );
        continue;
      }
      newFilters.push({
        code: filter.code,
        operator: negated ? Operator.NOT_EQUALS : Operator.EQUALS,
        value: tokens.join(','),
      });
    }
    return { ...searchRequest, filters: newFilters };
  }

  /**
   * Looks up a ValueSet by canonical URL in this repo and returns its codes
   * formatted as `system|code` strings suitable for token search filters.
   * @param url - The canonical URL of the ValueSet to expand.
   * @returns Array of `system|code` strings; empty if the ValueSet has no codes.
   */
  private async expandValueSetCodes(url: string): Promise<string[]> {
    const bundle = await this.search({
      resourceType: 'ValueSet',
      filters: [{ code: 'url', operator: Operator.EQUALS, value: url }],
    });
    const valueSet = bundle.entry?.[0]?.resource as
      | {
          expansion?: { contains?: { system?: string; code?: string }[] };
          compose?: { include?: { system?: string; concept?: { code?: string }[] }[] };
        }
      | undefined;
    if (!valueSet) {
      throw new OperationOutcomeError(badRequest(`ValueSet not found: ${url}`));
    }
    // Emit both `system|code` and bare `code` so that:
    //  - Resources with explicit Coding.system match `system|code`.
    //  - Resources with implicit-system code fields (e.g. Patient.gender stored
    //    as a plain code) still match via the bare-code path.
    const tokens = new Set<string>();
    if (valueSet.expansion?.contains) {
      for (const c of valueSet.expansion.contains) {
        if (c.code) {
          if (c.system) {
            tokens.add(`${c.system}|${c.code}`);
          }
          tokens.add(c.code);
        }
      }
    }
    if (tokens.size === 0 && valueSet.compose?.include) {
      for (const inc of valueSet.compose.include) {
        for (const c of inc.concept ?? []) {
          if (c.code) {
            if (inc.system) {
              tokens.add(`${inc.system}|${c.code}`);
            }
            tokens.add(c.code);
          }
        }
      }
    }
    return Array.from(tokens);
  }

  /**
   * Pre-processes chained filters (e.g. `subject.name=Smith`) by recursively
   * resolving the chain into a plain reference filter listing the matched
   * reference strings.  Returns `undefined` if any chain has no matches, in
   * which case the whole search must yield no results.
   * @param searchRequest - The original search request.
   * @returns A new search request with chained filters expanded, or `undefined` if no result is possible.
   */
  private async expandChainedFilters<T extends Resource>(
    searchRequest: SearchRequest<T>
  ): Promise<SearchRequest<T> | undefined> {
    const filters = searchRequest.filters ?? EMPTY;
    let needsExpansion = false;
    for (const f of filters) {
      if (f.code.includes('.') && !f.code.startsWith('_has:')) {
        needsExpansion = true;
        break;
      }
    }
    if (!needsExpansion) {
      return searchRequest;
    }

    const newFilters: Filter[] = [];
    for (const filter of filters) {
      if (!filter.code.includes('.') || filter.code.startsWith('_has:')) {
        newFilters.push(filter);
        continue;
      }
      const expanded = await this.expandSingleChain(searchRequest.resourceType, filter);
      if (!expanded) {
        return undefined;
      }
      newFilters.push(expanded);
    }
    return { ...searchRequest, filters: newFilters };
  }

  /**
   * Resolves a single chained filter to a plain reference filter.
   * Supports type-disambiguation via `:Type` modifier on the reference field
   * (e.g. `subject:Patient.name`) and arbitrary chain depth via recursion
   * back through `search`.
   * @param resourceType - The base resource type the chain starts from.
   * @param filter - A filter whose `code` contains at least one dot.
   * @returns A rewritten filter, or `undefined` when the chain matches nothing.
   */
  private async expandSingleChain(resourceType: string, filter: Filter): Promise<Filter | undefined> {
    const dotIdx = filter.code.indexOf('.');
    const head = filter.code.substring(0, dotIdx);
    const tail = filter.code.substring(dotIdx + 1);

    const colonIdx = head.indexOf(':');
    const refField = colonIdx >= 0 ? head.substring(0, colonIdx) : head;
    const targetTypeFilter = colonIdx >= 0 ? head.substring(colonIdx + 1) : undefined;

    const sp = getSearchParameter(resourceType, refField);
    if (sp?.type !== 'reference') {
      return undefined;
    }

    const targets = targetTypeFilter ? [targetTypeFilter] : (sp.target ?? []);
    if (targets.length === 0) {
      return undefined;
    }

    const matchedRefs: string[] = [];
    for (const target of targets) {
      const subBundle = await this.search({
        resourceType: target as Resource['resourceType'],
        filters: [{ code: tail, operator: filter.operator, value: filter.value }],
      });
      for (const e of subBundle.entry ?? EMPTY) {
        const r = e.resource;
        if (r?.id) {
          matchedRefs.push(`${r.resourceType}/${r.id}`);
        }
      }
    }

    if (matchedRefs.length === 0) {
      return undefined;
    }

    return { code: refField, operator: Operator.EQUALS, value: matchedRefs.join(',') };
  }

  /**
   * Resolves `_include` and `_revinclude` for a search result, mutating `entry`
   * in place. Mirrors the server's `getExtraEntries` algorithm:
   *  - First pass: apply every include / revInclude against the matched base.
   *  - Subsequent passes: only re-apply targets carrying the `:iterate` modifier
   *    against the resources newly added on the previous pass.
   *  - Depth is capped at 5 to match the server circuit breaker.
   * @param searchRequest - The search request whose include / revInclude targets to resolve.
   * @param entry - The bundle entry array to extend in place with included resources.
   */
  private async resolveIncludes<T extends Resource>(
    searchRequest: SearchRequest<T>,
    entry: BundleEntry<WithId<T>>[]
  ): Promise<void> {
    const seen = new Set<string>();
    let base: Resource[] = [];
    for (const e of entry) {
      const r = e.resource as Resource | undefined;
      if (r?.id) {
        const ref = `${r.resourceType}/${r.id}`;
        seen.add(ref);
        base.push(r);
      }
    }

    let depth = 0;
    let iterateOnly = false;

    while (base.length > 0) {
      if (depth >= 5) {
        throw new OperationOutcomeError(
          badRequest(`Search with _(rev)include reached query scope limit: depth=${depth}`)
        );
      }

      const next: BundleEntry[] = [];
      for (const include of searchRequest.include ?? EMPTY) {
        if (iterateOnly && include.modifier !== Operator.ITERATE) {
          continue;
        }
        next.push(...(await this.getIncludeEntries(include, base)));
      }
      for (const revInclude of searchRequest.revInclude ?? EMPTY) {
        if (iterateOnly && revInclude.modifier !== Operator.ITERATE) {
          continue;
        }
        next.push(...(await this.getRevIncludeEntries(revInclude, base)));
      }

      base = [];
      for (const incEntry of next) {
        const r = incEntry.resource;
        if (!r?.id) {
          continue;
        }
        const ref = `${r.resourceType}/${r.id}`;
        if (seen.has(ref)) {
          continue;
        }
        seen.add(ref);
        entry.push(incEntry as BundleEntry<WithId<T>>);
        base.push(r);
      }

      iterateOnly = true;
      depth++;
    }
  }

  /**
   * Resolves `_include` (forward) references for the given base resources.
   * Handles both direct Reference fields and canonical URL references; the
   * latter are resolved via a sub-search on the target resourceType's `url`.
   * @param include - The include target (resource type + search parameter).
   * @param resources - The base resources to evaluate the search parameter expression against.
   * @returns Bundle entries for the resolved included resources, tagged with `search.mode = 'include'`.
   */
  private async getIncludeEntries(include: IncludeTarget, resources: Resource[]): Promise<BundleEntry[]> {
    const { resourceType, searchParam: code } = include;
    const searchParam = getSearchParameter(resourceType, code);
    if (!searchParam) {
      throw new OperationOutcomeError(badRequest(`Invalid include parameter: ${resourceType}:${code}`));
    }
    const fhirPathResult = evalFhirPathTyped(searchParam.expression as string, resources.map(toTypedValue));
    const references: Reference[] = [];
    const canonicalUrls: string[] = [];
    for (const value of fhirPathResult) {
      if (value.type === PropertyType.Reference) {
        references.push(value.value as Reference);
      } else if (value.type === PropertyType.canonical || value.type === PropertyType.uri) {
        if (typeof value.value === 'string' && value.value.length > 0) {
          canonicalUrls.push(value.value);
        }
      }
    }

    const resolved: Resource[] = [];
    for (const ref of references) {
      try {
        resolved.push(await this.readReference(ref));
      } catch {
        // Skip references that cannot be resolved in the in-memory repo.
      }
    }

    if (canonicalUrls.length > 0 && searchParam.target) {
      const uniqueUrls = Array.from(new Set(canonicalUrls.map((url) => url.split('|')[0])));
      for (const targetType of searchParam.target) {
        const subBundle = await this.search({
          resourceType: targetType,
          filters: [{ code: 'url', operator: Operator.EQUALS, value: uniqueUrls.join(',') }],
        });
        for (const e of subBundle.entry ?? EMPTY) {
          if (e.resource) {
            resolved.push(e.resource);
          }
        }
      }
    }

    return resolved.map((resource) => ({
      resource: deepClone(resource),
      search: { mode: 'include' },
    }));
  }

  /**
   * Resolves `_revinclude` (reverse) references by searching the target
   * resourceType for resources that reference any of the base resources.
   * If the SearchParameter is canonical, base references are emitted as the
   * base resources' `url` field rather than `ResourceType/id`.
   * @param revInclude - The revInclude target (resource type + search parameter).
   * @param resources - The base resources to be referenced by the included resources.
   * @returns Bundle entries for the resolved reverse-included resources, tagged with `search.mode = 'include'`.
   */
  private async getRevIncludeEntries(revInclude: IncludeTarget, resources: Resource[]): Promise<BundleEntry[]> {
    const { resourceType, searchParam: code } = revInclude;
    const searchParam = getSearchParameter(resourceType, code);
    if (!searchParam) {
      throw new OperationOutcomeError(badRequest(`Invalid include parameter: ${resourceType}:${code}`));
    }
    if (resources.length === 0) {
      return [];
    }

    const isCanonical = getSearchParameterDetails(resourceType, searchParam).type === SearchParameterType.CANONICAL;
    const refValues: string[] = [];
    for (const r of resources) {
      if (isCanonical) {
        const url = (r as Resource & { url?: string }).url;
        if (url) {
          refValues.push(url);
        }
      } else {
        refValues.push(getReferenceString(r as WithId<Resource>));
      }
    }
    if (refValues.length === 0) {
      return [];
    }

    const subBundle = await this.search({
      resourceType: resourceType as Resource['resourceType'],
      filters: [{ code, operator: Operator.EQUALS, value: refValues.join(',') }],
    });
    return (subBundle.entry ?? []).map((e) => ({
      resource: e.resource,
      search: { mode: 'include' },
    }));
  }

  async searchByReference<T extends Resource>(
    searchRequest: SearchRequest<T>,
    referenceField: string,
    references: string[]
  ): Promise<Record<string, WithId<T>[]>> {
    searchRequest.filters ??= [];
    const results: Record<string, WithId<T>[]> = {};
    for (const reference of references) {
      searchRequest.filters.push({ code: referenceField, operator: Operator.EQUALS, value: reference });
      const bundle = await this.search(searchRequest);
      results[reference] = [];
      for (const entry of bundle.entry ?? EMPTY) {
        if (entry.resource) {
          results[reference].push(entry.resource);
        }
      }
      searchRequest.filters.pop();
    }
    return results;
  }

  async deleteResource(resourceType: string, id: string): Promise<void> {
    if (!this.resources.get(resourceType)?.get(id)) {
      throw new OperationOutcomeError(notFound);
    }
    this.resources.get(resourceType)?.delete(id);
  }

  withTransaction<TResult>(callback: (client: undefined) => Promise<TResult>): Promise<TResult> {
    // MockRepository currently does not support transactions
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
