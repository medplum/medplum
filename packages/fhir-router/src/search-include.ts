// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { IncludeTarget, SearchRequest, WithId } from '@medplum/core';
import {
  DEFAULT_MAX_SEARCH_COUNT,
  OperationOutcomeError,
  Operator,
  PropertyType,
  SearchParameterType,
  badRequest,
  evalFhirPathTyped,
  flatMapFilter,
  getReferenceString,
  getSearchParameter,
  getSearchParameterDetails,
  isResource,
  toTypedValue,
} from '@medplum/core';
import type { BundleEntry, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import type { FhirRepository } from './repo';

/**
 * The default maximum depth of `_include:iterate` / `_revinclude:iterate` recursion.
 */
const DEFAULT_MAX_INCLUDE_DEPTH = 5;

/**
 * FHIRPath result types that represent a canonical reference rather than a literal `Reference`.
 */
const canonicalReferenceTypes: string[] = [PropertyType.canonical, PropertyType.uri];

/**
 * Executes a search on behalf of the include logic.
 *
 * The default implementation uses {@link FhirRepository.searchResources}. The server overrides this
 * to reuse its already-built query pipeline rather than re-entering the public `search()` entry point.
 */
export type IncludeSearchFn = (searchRequest: SearchRequest) => Promise<WithId<Resource>[]>;

export interface IncludeOptions {
  /**
   * Builds the `Bundle.entry.fullUrl` for an included resource.
   * When omitted, `fullUrl` is not set on the resulting entries.
   */
  readonly fullUrl?: (resourceType: string, id: string) => string;

  /**
   * The maximum number of `:iterate` rounds before the search is rejected. Defaults to 5.
   */
  readonly maxDepth?: number;

  /**
   * The maximum total number of bundle entries before the search is rejected.
   * Defaults to `DEFAULT_MAX_SEARCH_COUNT`.
   */
  readonly maxResults?: number;

  /**
   * Executes the sub-searches needed for canonical `_include` and for all `_revinclude` targets.
   * Defaults to `repo.searchResources()`.
   */
  readonly executeSearch?: IncludeSearchFn;
}

/**
 * Gets the extra search entries for the _include and _revinclude parameters.
 *
 * The `entries` array is appended to in place.
 *
 * @param repo - The FHIR repository.
 * @param searchRequest - The original search request.
 * @param resources - The resources returned by the original search.
 * @param entries - The output bundle entries.
 * @param options - Optional repository-specific behavior.
 */
export async function getExtraEntries<T extends Resource>(
  repo: FhirRepository,
  searchRequest: SearchRequest<T>,
  resources: T[],
  entries: BundleEntry[],
  options?: IncludeOptions
): Promise<void> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_INCLUDE_DEPTH;
  const maxResults = options?.maxResults ?? DEFAULT_MAX_SEARCH_COUNT;

  let base: Resource[] = resources;
  let iterateOnly = false;
  const seen = new Set<string>(resources.map((r) => `${r.resourceType}/${r.id}`));
  let depth = 0;

  while (base.length > 0) {
    // Circuit breaker / load limit
    if (depth >= maxDepth || entries.length > maxResults) {
      throw new Error(`Search with _(rev)include reached query scope limit: depth=${depth}, results=${entries.length}`);
    }

    const includes = flatMapFilter(searchRequest.include, (p) =>
      !iterateOnly || p.modifier === Operator.ITERATE ? getSearchIncludeEntries(repo, p, base, options) : undefined
    );
    const revincludes = flatMapFilter(searchRequest.revInclude, (p) =>
      !iterateOnly || p.modifier === Operator.ITERATE ? getSearchRevIncludeEntries(repo, p, base, options) : undefined
    );

    const includedResources = (await Promise.all([...includes, ...revincludes])).flat();
    base = [];
    for (const entry of includedResources) {
      const resource = entry.resource as Resource;
      base.push(resource);

      const ref = `${resource.resourceType}/${resource.id}`;
      if (!seen.has(ref)) {
        entries.push(entry);
      }
      seen.add(ref);
    }

    iterateOnly = true; // Only consider :iterate params on iterations after the first
    depth++;
  }
}

/**
 * Returns bundle entries for the resources that are included in the search result.
 *
 * See documentation on _include: https://hl7.org/fhir/R4/search.html#include
 * @param repo - The repository.
 * @param include - The include parameter.
 * @param resources - The base search result resources.
 * @param options - Optional repository-specific behavior.
 * @returns The bundle entries for the included resources.
 */
export async function getSearchIncludeEntries(
  repo: FhirRepository,
  include: IncludeTarget,
  resources: Resource[],
  options?: IncludeOptions
): Promise<BundleEntry[]> {
  const { resourceType, searchParam: code, targetType } = include;
  const searchParam = getSearchParameter(resourceType, code);
  if (!searchParam) {
    throw new OperationOutcomeError(badRequest(`Invalid include parameter: ${resourceType}:${code}`));
  }

  const fhirPathResult = evalFhirPathTyped(searchParam.expression as string, resources.map(toTypedValue));
  const references: Reference[] = [];
  const canonicalReferences: string[] = [];
  for (const result of fhirPathResult) {
    if (result.type === PropertyType.Reference) {
      references.push(result.value);
    } else if (canonicalReferenceTypes.includes(result.type)) {
      canonicalReferences.push(result.value);
    }
  }

  // `_include=ResourceType:code:targetType` restricts the include to references of
  // `targetType`; without the suffix every referenced resource type is returned.
  const targetReferences = targetType
    ? references.filter((reference) => reference.reference?.startsWith(targetType + '/'))
    : references;

  const includedResources = (await repo.readReferences(targetReferences)).filter((v) =>
    isResource(v)
  ) as WithId<Resource>[];

  const canonicalTargets = targetType ? searchParam.target?.filter((t) => t === targetType) : searchParam.target;
  if (canonicalTargets?.length && canonicalReferences.length > 0) {
    const executeSearch = options?.executeSearch ?? ((s: SearchRequest) => repo.searchResources(s));
    const canonicalSearches = canonicalTargets.map((canonicalTargetType) =>
      executeSearch({
        resourceType: canonicalTargetType,
        filters: [
          {
            code: 'url',
            operator: Operator.EQUALS,
            value: canonicalReferences.join(','),
          },
        ],
        count: DEFAULT_MAX_SEARCH_COUNT,
        offset: 0,
      })
    );

    // The `url` search is an exact match in the SQL implementation, but `matchesSearchRequest`
    // treats `uri` parameters as a substring match, so filter the results to exact hits here.
    // This is a no-op for repositories that already match exactly.
    const wanted = new Set(canonicalReferences);
    for (const searchResult of await Promise.all(canonicalSearches)) {
      for (const resource of searchResult) {
        const url = getCanonicalUrl(resource);
        if (url && wanted.has(url)) {
          includedResources.push(resource);
        }
      }
    }
  }

  return includedResources.map((resource) => toIncludeEntry(resource, options));
}

/**
 * Returns bundle entries for the resources that are reverse included in the search result.
 *
 * See documentation on _revinclude: https://hl7.org/fhir/R4/search.html#revinclude
 * @param repo - The repository.
 * @param revInclude - The revInclude parameter.
 * @param resources - The base search result resources.
 * @param options - Optional repository-specific behavior.
 * @returns The bundle entries for the reverse included resources.
 */
export async function getSearchRevIncludeEntries(
  repo: FhirRepository,
  revInclude: IncludeTarget,
  resources: Resource[],
  options?: IncludeOptions
): Promise<BundleEntry[]> {
  const { resourceType, searchParam: code, targetType } = revInclude;
  const searchParam = getSearchParameter(resourceType, code);
  if (!searchParam) {
    throw new OperationOutcomeError(badRequest(`Invalid include parameter: ${resourceType}:${code}`));
  }

  // `_revinclude=ResourceType:code:targetType` restricts the reverse include to
  // base resources of `targetType`. Build the references in a single pass,
  // filtering to the target type as we go.
  const isCanonical = getSearchParameterDetails(resourceType, searchParam).type === SearchParameterType.CANONICAL;
  const references: string[] = [];
  for (const resource of resources) {
    if (targetType && resource.resourceType !== targetType) {
      continue;
    }
    if (isCanonical) {
      const canonicalUrl = getCanonicalUrl(resource);
      if (canonicalUrl) {
        references.push(canonicalUrl);
      }
    } else {
      const reference = getReferenceString(resource);
      if (reference) {
        references.push(reference);
      }
    }
  }
  if (references.length === 0) {
    return [];
  }

  const executeSearch = options?.executeSearch ?? ((s: SearchRequest) => repo.searchResources(s));
  const revIncluded = await executeSearch({
    resourceType: resourceType as ResourceType,
    filters: [{ code, operator: Operator.EQUALS, value: references.join(',') }],
    count: DEFAULT_MAX_SEARCH_COUNT,
    offset: 0,
  });

  return revIncluded.map((resource) => toIncludeEntry(resource, options));
}

function toIncludeEntry(resource: WithId<Resource>, options?: IncludeOptions): BundleEntry {
  const fullUrl = options?.fullUrl?.(resource.resourceType, resource.id);
  return {
    ...(fullUrl ? { fullUrl } : undefined),
    search: { mode: 'include' },
    resource,
  };
}

function getCanonicalUrl(resource: Resource): string | undefined {
  return 'url' in resource ? resource.url : undefined;
}
