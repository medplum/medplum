// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { FhirFilterExpression, Filter, IncludeTarget, SearchRequest, SortRule, WithId } from '@medplum/core';
import {
  AccessPolicyInteraction,
  badRequest,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  evalFhirPathTyped,
  FhirFilterComparison,
  FhirFilterConnective,
  FhirFilterNegation,
  flatMapFilter,
  forbidden,
  formatSearchQuery,
  getDataType,
  getReferenceString,
  getSearchParameter,
  invalidSearchOperator,
  isResource,
  isResourceType,
  isUUID,
  OperationOutcomeError,
  Operator,
  parseFhirPath,
  parseFilterParameter,
  parseParameter,
  PropertyType,
  SearchParameterType,
  serverError,
  splitN,
  splitSearchOnComma,
  subsetResource,
  toPeriod,
  toTypedValue,
  validateResourceType,
} from '@medplum/core';
import type {
  Bundle,
  BundleEntry,
  BundleLink,
  Reference,
  Resource,
  ResourceType,
  SearchParameter,
} from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';
import { systemResourceProjectId } from '../constants';
import { DatabaseMode } from '../database';
import { deriveIdentifierSearchParameter } from './lookups/util';
import { clamp } from './operations/utils/parameters';
import type { Repository } from './repo';
import { getFullUrl } from './response';
import type { ColumnSearchParameterImplementation } from './searchparameter';
import { getSearchParameterImplementation } from './searchparameter';
import type { Expression, Operator as SQL } from './sql';
import {
  ArraySubquery,
  Column,
  ColumnType,
  Condition,
  Conjunction,
  Disjunction,
  escapeLikeString,
  Negation,
  periodToRangeString,
  SelectQuery,
  SqlFunction,
  Union,
  UnionAllBuilder,
} from './sql';
import { addTokenColumnsOrderBy, buildTokenColumnsSearchFilter } from './token-column';

/**
 * Defines the maximum number of resources returned in a single search result.
 */
const maxSearchResults = DEFAULT_MAX_SEARCH_COUNT;

const canonicalReferenceTypes: string[] = [PropertyType.canonical, PropertyType.uri];

type SearchRequestWithCountAndOffset<T extends Resource = Resource> = SearchRequest<T> & {
  count: number;
  offset: number;
};

interface Cursor {
  version: string;
  nextInstant: string;
  excludedIds?: string[];
}

/** Linking direction for chained search. */
const Direction = {
  FORWARD: 1,
  REVERSE: -1,
} as const;

interface ChainedSearchLink {
  originType: string;
  targetType: string;
  code: string;
  implementation: ColumnSearchParameterImplementation;
  direction: (typeof Direction)['FORWARD'] | (typeof Direction)['REVERSE'];
}

interface ChainedSearchParameter {
  chain: ChainedSearchLink[];
  filter: Filter;
}

export interface SearchOptions extends Pick<GetBaseSelectQueryOptions, 'maxResourceVersion'> {}

export async function searchImpl<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest<T>,
  options?: SearchOptions
): Promise<Bundle<WithId<T>>> {
  validateSearchResourceTypes(repo, searchRequest);
  applyCountAndOffsetLimits(searchRequest);

  let entry = undefined;
  let rowCount = undefined;
  let nextResource: T | undefined;
  repo.setOriginResourceType(searchRequest.types ?? searchRequest.resourceType);
  if (searchRequest.count > 0) {
    const builder = getSelectQueryForSearch(repo, searchRequest, options);
    ({ entry, rowCount, nextResource } = await getSearchEntries<T>(repo, searchRequest, builder));
  }

  let total = undefined;
  if (searchRequest.total === 'accurate' || searchRequest.total === 'estimate') {
    total = await getCount(repo, searchRequest, rowCount);
  }

  repo.clearOriginResourceType();

  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry,
    total,
    link: getSearchLinks(searchRequest, entry, nextResource),
  };
}

export async function searchByReferenceImpl<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest<T>,
  referenceField: string,
  referenceValues: string[]
): Promise<Record<string, WithId<T>[]>> {
  validateSearchResourceTypes(repo, searchRequest);

  // Hold on to references to parts of the SelectQuery that need to be modified per reference value
  const referenceConditions: Condition[] = [];
  const referenceColumns: Column[] = [];

  const searchQuery = getSelectQueryForSearch(repo, searchRequest, {
    addColumns: true,
    limitModifier: 0,
    resourceTypeQueryCallback: (resourceType, builder) => {
      const param = getSearchParameter(resourceType, referenceField);
      if (param?.type !== 'reference') {
        throw new OperationOutcomeError(
          badRequest(`Invalid reference search parameter on ${resourceType}: ${referenceField}`)
        );
      }
      const impl = getSearchParameterImplementation(resourceType, param);
      if (impl.searchStrategy !== 'column') {
        throw new OperationOutcomeError(
          badRequest(`Invalid reference search parameter on ${resourceType}: ${referenceField}`)
        );
      }
      const expr = buildReferenceEqualsCondition(builder.effectiveTableName, impl, referenceValues[0]);
      referenceConditions.push(expr);
      builder.whereExpr(expr);

      const column = new Column(undefined, `'${referenceValues[0]}'`, true, 'ref');
      referenceColumns.push(column);
      builder.column(column);
    },
  });

  const unionAllBuilder = new UnionAllBuilder();
  for (const refValue of referenceValues) {
    // Update each condition with the current reference value
    for (const cond of referenceConditions) {
      cond.parameter = refValue;
    }
    // Update each column with the current reference value literal
    for (const column of referenceColumns) {
      column.actualColumnName = `'${refValue}'`;
    }
    unionAllBuilder.add(searchQuery);
  }

  const rows: {
    content: string;
    ref: string;
  }[] = await unionAllBuilder.execute(repo.getDatabaseClient(DatabaseMode.READER));

  const results: Record<string, WithId<T>[]> = Object.create(null);
  for (const ref of referenceValues) {
    results[ref] = [];
  }
  for (const row of rows) {
    const resource = JSON.parse(row.content) as WithId<T>;
    removeResourceFields(resource, repo, searchRequest);
    results[row.ref].push(resource);
  }

  return results;
}

function applyCountAndOffsetLimits<T extends Resource>(
  searchRequest: SearchRequest
): asserts searchRequest is SearchRequestWithCountAndOffset<T> {
  if (searchRequest.count === undefined) {
    searchRequest.count = DEFAULT_SEARCH_COUNT;
  } else if (searchRequest.count > maxSearchResults) {
    searchRequest.count = maxSearchResults;
  }

  if (searchRequest.offset === undefined) {
    searchRequest.offset = 0;
  } else {
    const maxOffset = getConfig().maxSearchOffset;
    if (maxOffset !== undefined && searchRequest.offset > maxOffset) {
      throw new OperationOutcomeError(
        badRequest(`Search offset exceeds maximum (got ${searchRequest.offset}, max ${maxOffset})`)
      );
    }
  }
}

/**
 * Validates that the resource type(s) are valid and that the user has permission to read them.
 * @param repo - The user's repository.
 * @param searchRequest - The incoming search request.
 */
function validateSearchResourceTypes(repo: Repository, searchRequest: SearchRequest): void {
  if (searchRequest.types) {
    for (const resourceType of searchRequest.types) {
      validateSearchResourceType(repo, resourceType);
    }
  } else {
    validateSearchResourceType(repo, searchRequest.resourceType);
  }
}

/**
 * Validates that the resource type is valid and that the user has permission to read it.
 * @param repo - The user's repository.
 * @param resourceType - The resource type to validate.
 */
function validateSearchResourceType(repo: Repository, resourceType: ResourceType): void {
  validateResourceType(resourceType);

  if (resourceType === 'Binary') {
    throw new OperationOutcomeError(badRequest('Cannot search on Binary resource type'));
  }

  if (!repo.supportsInteraction(AccessPolicyInteraction.SEARCH, resourceType)) {
    throw new OperationOutcomeError(forbidden);
  }
}

interface GetSelectQueryForSearchOptions extends GetBaseSelectQueryOptions {
  /** Number added to `searchRequest.count` when specifying the query LIMIT. Default is 1 */
  limitModifier?: number;
}

export function getSelectQueryForSearch<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest<T>,
  options?: GetSelectQueryForSearchOptions
): SelectQuery {
  applyCountAndOffsetLimits(searchRequest);

  const builder = getBaseSelectQuery(repo, searchRequest, options);
  addSortRules(repo, builder, searchRequest);
  const count = searchRequest.count;
  builder.limit(count + (options?.limitModifier ?? 1)); // Request one extra to test if there are more results
  if (searchRequest.offset > 0) {
    if (searchRequest.cursor) {
      throw new OperationOutcomeError(badRequest('Cannot use both offset and cursor'));
    }
    builder.offset(searchRequest.offset);
  } else if (searchRequest.cursor) {
    const cursor = parseCursor(searchRequest.cursor);
    if (cursor) {
      builder.orderBy(new Column(searchRequest.resourceType, 'lastUpdated', false));
      builder.whereExpr(new Condition(new Column(searchRequest.resourceType, 'lastUpdated'), '>=', cursor.nextInstant));

      if (cursor.excludedIds?.length) {
        builder.whereExpr(new Negation(new Condition('id', 'IN', cursor.excludedIds)));
      }
    }
  }
  return builder;
}

/**
 * Returns the bundle entries for a search request.
 * @param repo - The repository.
 * @param searchRequest - The search request.
 * @param builder - The `SelectQuery` builder that is ready to execute.
 * @returns The bundle entries for the search result.
 */
async function getSearchEntries<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequestWithCountAndOffset<T>,
  builder: SelectQuery
): Promise<{ entry: BundleEntry<WithId<T>>[]; rowCount: number; nextResource?: T }> {
  const config = getConfig();
  const originalLimit = builder.limit_;

  if (config.fhirSearchMinLimit !== undefined && config.fhirSearchMinLimit > builder.limit_) {
    builder.limit(config.fhirSearchMinLimit);
  }

  const client = repo.getDatabaseClient(DatabaseMode.READER);
  let rows: any[];
  try {
    if (config.fhirSearchDiscourageSeqScan) {
      // Despite the name, this doesn't truly remove the possibility of a sequential scan,
      // just massively inflates the cost of a sequential scan to the planner.
      await client.query('SET enable_seqscan = off');
    }
    rows = await builder.execute(client);
  } finally {
    if (config.fhirSearchDiscourageSeqScan) {
      await client.query('RESET enable_seqscan');
    }
  }

  const rowCount = Math.min(rows.length, originalLimit);
  const resources = [];
  for (let i = 0; i < rowCount; i++) {
    const row = rows[i];
    if (row.content) {
      resources.push(JSON.parse(row.content));
    } else {
      // Handle missing content
      // In the original implementation of deleted resources, the content was not stored in the database.
      resources.push({
        resourceType: searchRequest.resourceType,
        id: row.id,
        meta: { lastUpdated: row.lastUpdated?.toISOString() },
      } as WithId<T>);
    }
  }
  let nextResource: T | undefined;
  if (resources.length > searchRequest.count) {
    nextResource = resources.pop();
  }
  const entries = resources.map(
    (resource): BundleEntry<WithId<T>> => ({
      fullUrl: getFullUrl(resource.resourceType, resource.id),
      search: { mode: 'match' },
      resource,
    })
  );

  if (searchRequest.include || searchRequest.revInclude) {
    await getExtraEntries(repo, searchRequest, resources, entries);
  }

  for (const entry of entries) {
    if (!entry.resource) {
      continue;
    }
    removeResourceFields(entry.resource, repo, searchRequest);
  }

  return {
    entry: entries,
    rowCount,
    nextResource,
  };
}

interface GetBaseSelectQueryOptions {
  /** If `true`, the "id" and "content" columns are selected. Defaults to `true`. */
  addColumns?: boolean;
  /** Callback invoked for each resource type and  its `SelectQuery` after all filters are applied. */
  resourceTypeQueryCallback?: (resourceType: SearchRequest['resourceType'], builder: SelectQuery) => void;
  /** The maximum resource version to include in the search. If zero is specified, only resources with a NULL version are included. */
  maxResourceVersion?: number;
}
function getBaseSelectQuery(
  repo: Repository,
  searchRequest: SearchRequest,
  opts?: GetBaseSelectQueryOptions
): SelectQuery {
  let builder: SelectQuery;
  if (searchRequest.types) {
    const queries: SelectQuery[] = [];
    for (const resourceType of searchRequest.types) {
      const query = getBaseSelectQueryForResourceType(repo, resourceType, searchRequest, opts);
      queries.push(query);
    }
    builder = new SelectQuery('combined', new Union(...queries));
    if (opts?.addColumns ?? true) {
      builder.raw('*');
    }
  } else {
    builder = getBaseSelectQueryForResourceType(repo, searchRequest.resourceType, searchRequest, opts);
  }
  return builder;
}

function getBaseSelectQueryForResourceType(
  repo: Repository,
  resourceType: ResourceType,
  searchRequest: SearchRequest,
  opts?: GetBaseSelectQueryOptions
): SelectQuery {
  const builder = new SelectQuery(resourceType);
  const addColumns = opts?.addColumns !== false;
  const idColumn = new Column(resourceType, 'id');
  if (addColumns) {
    builder
      .column(idColumn)
      .column(new Column(resourceType, 'lastUpdated'))
      .column(new Column(resourceType, 'content'));
  }
  if (opts?.maxResourceVersion !== undefined) {
    builder.whereExpr(new Condition(new Column(resourceType, '__version'), '<=', opts.maxResourceVersion));
  }
  if (!searchRequest.filters?.some((f) => f.code === '_deleted')) {
    repo.addDeletedFilter(builder);
  }
  repo.addSecurityFilters(builder, resourceType);
  addSearchFilters(repo, builder, resourceType, searchRequest);
  if (opts?.resourceTypeQueryCallback) {
    opts.resourceTypeQueryCallback(resourceType, builder);
  }

  if (addColumns && builder.joins.length > 0) {
    builder.distinctOn(idColumn);
  }
  return builder;
}

function removeResourceFields(resource: Resource, repo: Repository, searchRequest: SearchRequest): void {
  repo.removeHiddenFields(resource);
  if (searchRequest.fields) {
    const schema = getDataType(resource.resourceType);
    subsetResource(
      resource,
      schema.mandatoryProperties ? [...schema.mandatoryProperties, ...searchRequest.fields] : searchRequest.fields
    );
  } else if (searchRequest.summary) {
    const schema = getDataType(resource.resourceType);
    if (searchRequest.summary === 'data') {
      subsetResource(
        resource,
        Object.keys(resource).filter((k) => k !== 'text')
      );
    } else if (searchRequest.summary === 'text') {
      subsetResource(resource, schema.mandatoryProperties ? ['text', ...schema.mandatoryProperties] : ['text']);
    } else if (searchRequest.summary === 'true') {
      subsetResource(resource, schema.summaryProperties ? [...schema.summaryProperties] : []);
    }
  }
}

/**
 * Gets the extra search entries for the _include and _revinclude parameters.
 * @param repo - The FHIR repository.
 * @param searchRequest - The original search request.
 * @param resources - The resources returned by the original search.
 * @param entries - The output bundle entries.
 */
async function getExtraEntries<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest<T>,
  resources: T[],
  entries: BundleEntry[]
): Promise<void> {
  let base: Resource[] = resources;
  let iterateOnly = false;
  const seen = new Set<string>(resources.map((r) => `${r.resourceType}/${r.id}`));
  let depth = 0;

  while (base.length > 0) {
    // Circuit breaker / load limit
    if (depth >= 5 || entries.length > maxSearchResults) {
      throw new Error(`Search with _(rev)include reached query scope limit: depth=${depth}, results=${entries.length}`);
    }

    const includes = flatMapFilter(searchRequest.include, (p) =>
      !iterateOnly || p.modifier === Operator.ITERATE ? getSearchIncludeEntries(repo, p, base) : undefined
    );
    const revincludes = flatMapFilter(searchRequest.revInclude, (p) =>
      !iterateOnly || p.modifier === Operator.ITERATE ? getSearchRevIncludeEntries(repo, p, base) : undefined
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
 * @returns The bundle entries for the included resources.
 */
async function getSearchIncludeEntries(
  repo: Repository,
  include: IncludeTarget,
  resources: Resource[]
): Promise<BundleEntry[]> {
  const { resourceType, searchParam: code } = include;
  const searchParam = getSearchParameter(resourceType, code);
  if (!searchParam) {
    throw new OperationOutcomeError(badRequest(`Invalid include parameter: ${resourceType}:${code}`));
  }

  const fhirPathResult = evalFhirPathTyped(searchParam.expression as string, resources.map(toTypedValue));
  const references: Reference[] = [];
  const canonicalReferences: string[] = [];
  for (const result of fhirPathResult) {
    if (result.type === PropertyType.Reference) {
      const ref = result.value as Reference;
      references.push(ref);
      const refType = ref.reference?.split('/')[0];
      if (refType && isResourceType(refType)) {
        repo.onResourceTypeQuery?.(refType, 'include-ref', { include });
      }
    } else if (canonicalReferenceTypes.includes(result.type)) {
      canonicalReferences.push(result.value);
    }
  }

  const includedResources = (await repo.readReferences(references)).filter((v) => isResource(v)) as WithId<Resource>[];
  if (searchParam.target && canonicalReferences.length > 0) {
    const canonicalSearches = searchParam.target.map((resourceType) => {
      const searchRequest = {
        resourceType: resourceType,
        filters: [
          {
            code: 'url',
            operator: Operator.EQUALS,
            value: canonicalReferences.join(','),
          },
        ],
        count: DEFAULT_MAX_SEARCH_COUNT,
        offset: 0,
      };
      repo.onResourceTypeQuery(resourceType, 'include-canonical', {
        include,
        target: searchParam.target?.join(','),
        canonicalReferences: canonicalReferences.join(','),
      });
      const query = getSelectQueryForSearch(repo, searchRequest);
      return getSearchEntries(repo, searchRequest, query);
    });

    const searchResults = await Promise.all(canonicalSearches);
    for (const result of searchResults) {
      for (const entry of result.entry) {
        includedResources.push(entry.resource as WithId<Resource>);
      }
    }
  }

  return includedResources.map((resource) => ({
    fullUrl: getFullUrl(resource.resourceType, resource.id),
    search: { mode: 'include' },
    resource,
  }));
}

/**
 * Returns bundle entries for the resources that are reverse included in the search result.
 *
 * See documentation on _revinclude: https://hl7.org/fhir/R4/search.html#revinclude
 * @param repo - The repository.
 * @param revInclude - The revInclude parameter.
 * @param resources - The base search result resources.
 * @returns The bundle entries for the reverse included resources.
 */
async function getSearchRevIncludeEntries(
  repo: Repository,
  revInclude: IncludeTarget,
  resources: Resource[]
): Promise<BundleEntry[]> {
  const { resourceType, searchParam: code } = revInclude;
  const searchParam = getSearchParameter(resourceType, code);
  if (!searchParam) {
    throw new OperationOutcomeError(badRequest(`Invalid include parameter: ${resourceType}:${code}`));
  }

  const references =
    getSearchParameterImplementation(resourceType, searchParam).type === SearchParameterType.CANONICAL
      ? flatMapFilter(resources, (r) => getCanonicalUrl(r))
      : resources.map(getReferenceString);
  const searchRequest = {
    resourceType: resourceType as ResourceType,
    filters: [{ code, operator: Operator.EQUALS, value: references.join(',') }],
    count: DEFAULT_MAX_SEARCH_COUNT,
    offset: 0,
  };

  const query = getSelectQueryForSearch(repo, searchRequest);
  const entries = (await getSearchEntries(repo, searchRequest, query)).entry;
  for (const entry of entries) {
    entry.search = { mode: 'include' };
  }
  return entries;
}

/**
 * Returns the search bundle links for a search request.
 * At minimum, the 'self' link will be returned.
 * If "count" does not equal zero, then 'first', 'next', and 'previous' links will be included.
 * @param searchRequest - The search request.
 * @param entries - The search bundle entries.
 * @param nextResource - The next resource in the search results, which fell outside of the current page.
 * @returns The search bundle links.
 */
function getSearchLinks(
  searchRequest: SearchRequestWithCountAndOffset,
  entries: BundleEntry[] | undefined,
  nextResource?: Resource
): BundleLink[] {
  const result: BundleLink[] = [
    {
      relation: 'self',
      url: getSearchUrl(searchRequest),
    },
  ];

  if (searchRequest.count > 0 && entries?.length) {
    if (canUseCursorLinks(searchRequest)) {
      // In order to make progress, the lastUpdated timestamp must change from the first entry of the current page
      // to the first entry of the next page; otherwise we'd make the exact same request in a loop
      if (entries[0].resource?.meta?.lastUpdated === nextResource?.meta?.lastUpdated) {
        throw new OperationOutcomeError(serverError(new Error('Cursor fails to make progress')));
      }

      // Exclude resources that would appear on the next page, but have already been given on this one
      const excludedIds = flatMapFilter(entries, (entry) =>
        entry.resource?.meta?.lastUpdated === nextResource?.meta?.lastUpdated ? entry.resource?.id : undefined
      );
      buildSearchLinksWithCursor(searchRequest, nextResource, excludedIds, result);
    } else {
      buildSearchLinksWithOffset(searchRequest, nextResource, result);
    }
  }

  return result;
}

/**
 * Returns true if the search request can use cursor links.
 * Cursor links are more efficient than offset links for large result sets.
 * A search request can use cursor links if:
 *   1. Not using offset pagination
 *   2. Exactly one sort rule using _lastUpdated ascending
 *   3. It uses a page size that can accommodate resources with the same lastUpdated
 * @param searchRequest - The candidate search request.
 * @returns True if the search request can use cursor links.
 */
function canUseCursorLinks(searchRequest: SearchRequestWithCountAndOffset): boolean {
  return (
    searchRequest.offset === 0 &&
    searchRequest.count >= 20 &&
    searchRequest.sortRules?.length === 1 &&
    searchRequest.sortRules[0].code === '_lastUpdated' &&
    !searchRequest.sortRules[0].descending
  );
}

/**
 * Builds the "first", "next", and "previous" links for a search request using cursor pagination.
 * @param searchRequest - The search request.
 * @param nextResource - The next resource in the search results, which fell outside of the current page.
 * @param excludedIds - Resource IDs to exclude from the next page because they were already shown on the current one.
 * @param result - The search bundle links.
 */
function buildSearchLinksWithCursor(
  searchRequest: SearchRequestWithCountAndOffset,
  nextResource: Resource | undefined,
  excludedIds: string[],
  result: BundleLink[]
): void {
  result.push({
    relation: 'first',
    url: getSearchUrl({ ...searchRequest, cursor: undefined, offset: undefined }),
  });

  if (nextResource) {
    result.push({
      relation: 'next',
      url: getSearchUrl({
        ...searchRequest,
        cursor: formatCursor({
          version: '2',
          nextInstant: nextResource?.meta?.lastUpdated as string,
          excludedIds,
        }),
        offset: undefined,
      }),
    });
  }
}

/**
 * Parses a cursor string into a Cursor object.
 * @param cursor - The cursor string.
 * @returns The Cursor object or undefined if the cursor string is invalid.
 */
function parseCursor(cursor: string): Cursor | undefined {
  const version = cursor.slice(0, cursor.indexOf('-'));
  switch (version) {
    case '1':
      return parseV1Cursor(cursor);
    case '2':
      return parseV2Cursor(cursor);
    default:
      return undefined;
  }
}

/**
 * Parses a V1 cursor string of the format {version}-{nextInstant}-{nextId}
 * NOTE: The nextId field is no longer used.
 * @param cursor - The cursor string to parse.
 * @returns The parsed cursor object.
 */
function parseV1Cursor(cursor: string): Cursor | undefined {
  const [version, nextInstant, nextId] = splitN(cursor, '-', 3);
  if (!nextId) {
    return undefined;
  }
  const date = new Date(parseInt(nextInstant, 10));
  return { version, nextInstant: date.toISOString() };
}

/**
 * Parses a V2 cursor string of the format {version}-{nextInstant}-{excludedIds}
 * NOTE: The excludedIds field is optional, and contains comma-separated IDs
 * @param cursor - The cursor string to parse.
 * @returns The parsed cursor object.
 */
function parseV2Cursor(cursor: string): Cursor | undefined {
  const [version, nextInstant, excludedIds] = splitN(cursor, '-', 3);
  if (!nextInstant) {
    return undefined;
  }
  const date = new Date(parseInt(nextInstant, 10));
  return { version, nextInstant: date.toISOString(), excludedIds: excludedIds?.split(',') };
}

/**
 * Formats a cursor object into a cursor string.
 * @param cursor - The cursor object.
 * @returns The cursor string.
 */
function formatCursor(cursor: Cursor): string {
  const date = new Date(cursor.nextInstant);
  let str = `${cursor.version}-${date.getTime()}`;
  if (cursor.excludedIds?.length) {
    str += '-' + cursor.excludedIds.join(',');
  }
  return str;
}

/**
 * Adds the "first", "next", and "previous" links to the result array using offset pagination.
 * Offset pagination is slow, and should be avoided if possible.
 * @param searchRequest - The search request.
 * @param nextResource - The next resource in the search results, which fell outside of the current page.
 * @param result - The search bundle links.
 */
function buildSearchLinksWithOffset(
  searchRequest: SearchRequestWithCountAndOffset,
  nextResource: Resource | undefined,
  result: BundleLink[]
): void {
  const count = searchRequest.count;
  const offset = searchRequest.offset;

  result.push({
    relation: 'first',
    url: getSearchUrl({ ...searchRequest, offset: 0 }),
  });

  if (nextResource) {
    result.push({
      relation: 'next',
      url: getSearchUrl({ ...searchRequest, offset: offset + count }),
    });
  }

  if (offset > 0) {
    result.push({
      relation: 'previous',
      url: getSearchUrl({ ...searchRequest, offset: offset - count }),
    });
  }
}

function getSearchUrl(searchRequest: SearchRequest): string {
  return `${getConfig().baseUrl}fhir/R4/${searchRequest.resourceType}${formatSearchQuery(searchRequest)}`;
}

/**
 * Returns the count for a search request.
 * This ignores page number and page size.
 * We always start with an "estimate" count to protect against expensive queries.
 * If the estimate is less than the "accurateCountThreshold" config setting (default 1,000,000), then we run an accurate count.
 * @param repo - The repository.
 * @param searchRequest - The search request.
 * @param rowCount - The number of matching results if found.
 * @returns The total number of matching results.
 */
async function getCount(repo: Repository, searchRequest: SearchRequest, rowCount?: number): Promise<number> {
  let estimateCount = await getEstimateCount(repo, searchRequest);
  estimateCount = clampEstimateCount(searchRequest, estimateCount, rowCount);
  if (estimateCount < getConfig().accurateCountThreshold) {
    return getAccurateCount(repo, searchRequest);
  }
  return estimateCount;
}

/**
 * Returns the total number of matching results for a search request.
 * This ignores page number and page size.
 * @param repo - The repository.
 * @param searchRequest - The search request.
 * @returns The total number of matching results.
 */
async function getAccurateCount(repo: Repository, searchRequest: SearchRequest): Promise<number> {
  const builder = getBaseSelectQuery(repo, searchRequest, { addColumns: false });

  if (builder.joins.length > 0) {
    builder.raw(`COUNT (DISTINCT "${searchRequest.resourceType}"."id")::int AS "count"`);
  } else {
    builder.raw('COUNT(*)::int AS "count"');
  }

  const rows = await builder.execute(repo.getDatabaseClient(DatabaseMode.READER));
  return rows[0].count as number;
}

/**
 * Returns the estimated number of matching results for a search request.
 * This ignores page number and page size.
 * This uses the estimated row count technique as described here: https://wiki.postgresql.org/wiki/Count_estimate
 * @param repo - The repository.
 * @param searchRequest - The search request.
 * @returns The total number of matching results.
 */
async function getEstimateCount(repo: Repository, searchRequest: SearchRequest): Promise<number> {
  const builder = getBaseSelectQuery(repo, searchRequest);
  builder.explain = true;

  // See: https://wiki.postgresql.org/wiki/Count_estimate
  // This parses the query plan to find the estimated number of rows.
  const rows = await builder.execute(repo.getDatabaseClient(DatabaseMode.READER));
  for (const row of rows) {
    const queryPlan = row['QUERY PLAN'];
    const match = /rows=(\d+)/.exec(queryPlan);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return 0;
}

/**
 * Returns a "clamped" estimate count based on the actual row count.
 * @param searchRequest - The search request.
 * @param estimateCount - The estimated number of matching results.
 * @param rowCount - The number of matching results if found. Value can be up to one more than the requested count.
 * @returns The clamped estimate count.
 */
export function clampEstimateCount(searchRequest: SearchRequest, estimateCount: number, rowCount?: number): number {
  if (searchRequest.count === 0 || rowCount === undefined) {
    // If "count only" or rowCount is undefined, then the estimate is the best we can do
    return estimateCount;
  }

  const pageSize = searchRequest.count ?? DEFAULT_SEARCH_COUNT;
  const startIndex = searchRequest.offset ?? 0;
  const minCount = rowCount > 0 ? startIndex + rowCount : 0;
  const maxCount = rowCount <= pageSize ? startIndex + rowCount : Number.MAX_SAFE_INTEGER;
  return clamp(minCount, estimateCount, maxCount);
}

/**
 * Adds all search filters as "WHERE" clauses to the query builder.
 * @param repo - The repository.
 * @param selectQuery - The select query builder.
 * @param resourceType - The type of resources requested.
 * @param searchRequest - The search request.
 */
function addSearchFilters(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  searchRequest: SearchRequest
): void {
  const expr = buildSearchExpression(repo, selectQuery, resourceType, searchRequest);
  if (expr) {
    selectQuery.predicate.expressions.push(expr);
  }
}

export function isChainedSearchFilter(filter: Filter): boolean {
  return filter.code.startsWith('_has:') || filter.code.includes('.');
}

export function buildSearchExpression(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  searchRequest: SearchRequest
): Expression | undefined {
  const expressions: Expression[] = [];
  if (searchRequest.filters) {
    for (const filter of searchRequest.filters) {
      let expr: Expression | undefined;
      if (isChainedSearchFilter(filter)) {
        const chain = parseChainedParameter(searchRequest.resourceType, filter);
        if (repo.onResourceTypeQuery) {
          for (const c of chain.chain) {
            repo.onResourceTypeQuery(
              c.targetType,
              c.direction === Direction.FORWARD ? 'chain-forward' : 'chain-reverse',
              {
                chain: chain.chain.map((c) => ({ targetType: c.targetType, direction: c.direction })),
                filter,
              }
            );
          }
        }
        expr = buildChainedSearch(repo, selectQuery, searchRequest.resourceType, chain);
      } else {
        expr = buildSearchFilterExpression(repo, selectQuery, resourceType, resourceType, filter);
      }

      if (expr) {
        expressions.push(expr);
      }
    }
  }
  if (expressions.length === 0) {
    return undefined;
  }
  if (expressions.length === 1) {
    return expressions[0];
  }
  return new Conjunction(expressions);
}

/**
 * Builds a single search filter as "WHERE" clause to the query builder.
 * @param repo - The repository.
 * @param selectQuery - The select query builder.
 * @param resourceType - The type of resources requested.
 * @param table - The resource table.
 * @param filter - The search filter.
 * @returns The search query where expression
 */
function buildSearchFilterExpression(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  table: string,
  filter: Filter
): Expression {
  if (typeof filter.value !== 'string') {
    throw new OperationOutcomeError(badRequest('Search filter value must be a string'));
  }

  if (filter.value.includes('\0')) {
    throw new OperationOutcomeError(badRequest('Search filter value cannot contain null bytes'));
  }

  if (filter.code.startsWith('_has:') || filter.code.includes('.')) {
    const chain = parseChainedParameter(resourceType, filter);
    return buildChainedSearch(repo, selectQuery, resourceType, chain);
  }

  const specialParamExpression = trySpecialSearchParameter(repo, selectQuery, resourceType, table, filter);
  if (specialParamExpression) {
    return specialParamExpression;
  }

  let param = getSearchParameter(resourceType, filter.code);
  if (!param?.code) {
    throw new OperationOutcomeError(badRequest(`Unknown search parameter: ${filter.code}`));
  }

  if (filter.operator === Operator.IDENTIFIER) {
    param = deriveIdentifierSearchParameter(param);
    filter = {
      code: param.code as string,
      operator: Operator.EQUALS,
      value: filter.value,
    };
  }

  const impl = getSearchParameterImplementation(resourceType, param);

  if (impl.searchStrategy === 'token-column') {
    return buildTokenColumnsSearchFilter(resourceType, table, param, filter);
  } else if (impl.searchStrategy === 'lookup-table') {
    return impl.lookupTable.buildWhere(selectQuery, resourceType, table, param, filter);
  }

  return buildNormalSearchFilterExpression(resourceType, table, param, impl, filter);
}

/**
 * Builds a search filter expression for a normal search parameter.
 *
 * Not any special cases, just a normal search parameter.
 * @param resourceType - The FHIR resource type.
 * @param table - The resource table.
 * @param param - The FHIR search parameter.
 * @param impl - The search parameter implementation.
 * @param filter - The search filter.
 * @returns A SQL "WHERE" clause expression.
 */
function buildNormalSearchFilterExpression(
  resourceType: string,
  table: string,
  param: SearchParameter,
  impl: ColumnSearchParameterImplementation,
  filter: Filter
): Expression {
  if (filter.operator === Operator.MISSING) {
    return new Condition(new Column(table, impl.columnName), filter.value === 'true' ? '=' : '!=', null);
  } else if (filter.operator === Operator.PRESENT) {
    return new Condition(new Column(table, impl.columnName), filter.value === 'true' ? '!=' : '=', null);
  }

  switch (param.type) {
    case 'string':
      return buildStringSearchFilter(table, impl, filter.operator, splitSearchOnComma(filter.value));
    case 'token':
    case 'uri':
      if (impl.type === SearchParameterType.BOOLEAN) {
        return buildBooleanSearchFilter(table, impl, filter);
      } else {
        return buildTokenSearchFilter(table, impl, filter.operator, splitSearchOnComma(filter.value));
      }
    case 'reference':
      return buildReferenceSearchFilter(table, impl, filter, splitSearchOnComma(filter.value));
    case 'date':
      return buildDateSearchFilter(table, impl, filter);
    case 'quantity':
      return buildQuantitySearchFilter(table, impl, filter);
    default: {
      const values = splitSearchOnComma(filter.value).map(
        (v) => new Condition(new Column(undefined, impl.columnName), fhirOperatorToSqlOperator(filter.operator), v)
      );
      const expr = new Disjunction(values);
      return impl.array ? new ArraySubquery(new Column(undefined, impl.columnName), expr) : expr;
    }
  }
}

/**
 * Returns true if the search parameter code is a special search parameter.
 *
 * See: https://www.hl7.org/fhir/search.html#all
 * @param repo - The repository.
 * @param selectQuery - The select query builder.
 * @param resourceType - The type of resources requested.
 * @param table - The resource table.
 * @param filter - The search filter.
 * @returns True if the search parameter is a special code.
 */
function trySpecialSearchParameter(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  table: string,
  filter: Filter
): Expression | undefined {
  switch (filter.code) {
    case '_id':
      return buildIdSearchFilter(
        table,
        {
          columnName: 'id',
          type: SearchParameterType.UUID,
          searchStrategy: 'column',
          parsedExpression: parseFhirPath('id'),
        },
        filter
      );
    case '_lastUpdated':
      return buildDateSearchFilter(
        table,
        {
          type: SearchParameterType.DATETIME,
          columnName: 'lastUpdated',
          searchStrategy: 'column',
          parsedExpression: parseFhirPath('lastUpdated'),
        },
        filter
      );
    case '_deleted':
      return buildBooleanSearchFilter(
        table,
        {
          type: SearchParameterType.BOOLEAN,
          columnName: 'deleted',
          searchStrategy: 'column',
          parsedExpression: parseFhirPath('deleted'),
        },
        filter
      );
    case '_project': {
      if (filter.operator === Operator.MISSING || filter.operator === Operator.PRESENT) {
        if (
          (filter.operator === Operator.MISSING && filter.value === 'true') ||
          (filter.operator === Operator.PRESENT && filter.value !== 'true')
        ) {
          // missing
          return new Condition(new Column(table, 'projectId'), '=', systemResourceProjectId);
        } else {
          // present
          return new Condition(new Column(table, 'projectId'), '!=', systemResourceProjectId);
        }
      }

      return buildIdSearchFilter(
        table,
        {
          columnName: 'projectId',
          type: SearchParameterType.UUID,
          array: false,
          searchStrategy: 'column',
          parsedExpression: parseFhirPath('projectId'),
        },
        filter
      );
    }
    case '_compartment': {
      return buildIdSearchFilter(
        table,
        {
          columnName: 'compartments',
          type: SearchParameterType.UUID,
          array: true,
          searchStrategy: 'column',
          parsedExpression: parseFhirPath('compartments'),
        },
        filter
      );
    }
    case '_filter':
      return buildFilterParameterExpression(repo, selectQuery, resourceType, table, parseFilterParameter(filter.value));
    default:
      return undefined;
  }
}

function buildFilterParameterExpression(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  table: string,
  filterExpression: FhirFilterExpression
): Expression {
  if (filterExpression instanceof FhirFilterNegation) {
    return new Negation(buildFilterParameterExpression(repo, selectQuery, resourceType, table, filterExpression.child));
  } else if (filterExpression instanceof FhirFilterConnective) {
    return buildFilterParameterConnective(repo, selectQuery, resourceType, table, filterExpression);
  } else if (filterExpression instanceof FhirFilterComparison) {
    return buildFilterParameterComparison(repo, selectQuery, resourceType, table, filterExpression);
  } else {
    throw new OperationOutcomeError(badRequest('Unknown filter expression type'));
  }
}

function buildFilterParameterConnective(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  table: string,
  filterConnective: FhirFilterConnective
): Expression {
  const expressions = [
    buildFilterParameterExpression(repo, selectQuery, resourceType, table, filterConnective.left),
    buildFilterParameterExpression(repo, selectQuery, resourceType, table, filterConnective.right),
  ];
  return filterConnective.keyword === 'and' ? new Conjunction(expressions) : new Disjunction(expressions);
}

function buildFilterParameterComparison(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  table: string,
  filterComparison: FhirFilterComparison
): Expression {
  return buildSearchFilterExpression(repo, selectQuery, resourceType, table, {
    code: filterComparison.path,
    operator: filterComparison.operator as Operator,
    value: filterComparison.value,
  });
}

/**
 * Adds a string search filter as "WHERE" clause to the query builder.
 * @param table - The table in which to search.
 * @param impl - The search parameter implementation info.
 * @param operator - The search operator.
 * @param values - The string values to search against.
 * @returns The select query condition.
 */
function buildStringSearchFilter(
  table: string,
  impl: ColumnSearchParameterImplementation,
  operator: Operator,
  values: string[]
): Expression {
  const column = new Column(impl.array ? undefined : table, impl.columnName);

  const expression = buildStringFilterExpression(column, operator, values);
  if (impl.array) {
    return new ArraySubquery(new Column(table, impl.columnName), expression);
  }
  return expression;
}

const prefixMatchOperators: Operator[] = [Operator.EQUALS, Operator.STARTS_WITH];
function buildStringFilterExpression(column: Column, operator: Operator, values: string[]): Expression {
  const conditions = values.map((v) => {
    if (operator === Operator.EXACT) {
      return new Condition(column, '=', v);
    } else if (operator === Operator.CONTAINS) {
      return new Condition(column, 'LOWER_LIKE', `%${escapeLikeString(v)}%`);
    } else if (prefixMatchOperators.includes(operator)) {
      return new Condition(column, 'LOWER_LIKE', `${escapeLikeString(v)}%`);
    } else {
      throw new OperationOutcomeError(badRequest('Unsupported string search operator: ' + operator));
    }
  });
  return new Disjunction(conditions);
}

/**
 * Adds an ID search filter as "WHERE" clause to the query builder.
 * @param table - The resource table name or alias.
 * @param impl - The search parameter implementation info.
 * @param filter - The search filter.
 * @returns The select query condition.
 */
function buildIdSearchFilter(table: string, impl: ColumnSearchParameterImplementation, filter: Filter): Expression {
  if (filter.operator === Operator.IN || filter.operator === Operator.NOT_IN) {
    throw new OperationOutcomeError(invalidSearchOperator(filter.operator, filter.code));
  }

  const values = splitSearchOnComma(filter.value);
  for (let i = 0; i < values.length; i++) {
    if (values[i].includes('/')) {
      values[i] = values[i].split('/').pop() as string;
    }
    if (!isUUID(values[i])) {
      values[i] = '00000000-0000-0000-0000-000000000000';
    }
  }

  const condition = buildEqualityCondition(impl, values, new Column(table, impl.columnName));
  if (filter.operator === Operator.NOT_EQUALS || filter.operator === Operator.NOT) {
    return new Negation(condition);
  }
  return condition;
}

/**
 * Adds a token search filter as "WHERE" clause to the query builder.
 * @param table - The resource table.
 * @param impl - The search parameter implementation info.
 * @param operator - The search operator.
 * @param values - The string values to search against.
 * @returns The select query condition.
 */
function buildTokenSearchFilter(
  table: string,
  impl: ColumnSearchParameterImplementation,
  operator: Operator,
  values: string[]
): Expression {
  const column = new Column(table, impl.columnName);
  const condition = buildEqualityCondition(impl, values, column);
  if (operator === Operator.NOT_EQUALS || operator === Operator.NOT) {
    return new Negation(condition);
  }
  return condition;
}

const allowedBooleanValues = ['true', 'false'];
function buildBooleanSearchFilter(
  table: string,
  impl: ColumnSearchParameterImplementation,
  filter: Filter
): Expression {
  if (filter.operator === Operator.IN || filter.operator === Operator.NOT_IN) {
    throw new OperationOutcomeError(invalidSearchOperator(filter.operator, filter.code));
  }
  if (!allowedBooleanValues.includes(filter.value)) {
    throw new OperationOutcomeError(badRequest(`Boolean search value must be 'true' or 'false'`));
  }

  return new Condition(
    new Column(table, impl.columnName),
    filter.operator === Operator.NOT_EQUALS || filter.operator === Operator.NOT ? '!=' : '=',
    filter.value
  );
}

/**
 * Adds a reference search filter as "WHERE" clause to the query builder.
 * @param table - The table in which to search.
 * @param impl - The search parameter implementation info.
 * @param filter - The search filter.
 * @param values - The string values to search against or a Column
 * @returns The select query condition.
 */
function buildReferenceSearchFilter(
  table: string,
  impl: ColumnSearchParameterImplementation,
  filter: Filter,
  values: string[] | Column
): Expression {
  if (filter.operator === Operator.IN || filter.operator === Operator.NOT_IN) {
    throw new OperationOutcomeError(invalidSearchOperator(filter.operator, filter.code));
  }
  const column = new Column(table, impl.columnName);
  if (Array.isArray(values)) {
    values = values.map((v) =>
      !v.includes('/') && (impl.columnName === 'subject' || impl.columnName === 'patient') ? `Patient/${v}` : v
    );
  }
  let condition: Condition;
  if (impl.array) {
    condition = new Condition(column, 'ARRAY_OVERLAPS_AND_IS_NOT_NULL', values, 'TEXT[]');
  } else if (values instanceof Column) {
    condition = new Condition(column, '=', values);
  } else if (values.length === 1) {
    condition = new Condition(column, '=', values[0]);
  } else {
    condition = new Condition(column, 'IN', values);
  }
  return filter.operator === Operator.NOT || filter.operator === Operator.NOT_EQUALS
    ? new Negation(condition)
    : condition;
}

function buildReferenceEqualsCondition(
  table: string,
  impl: ColumnSearchParameterImplementation,
  value: string | Column
): Condition {
  const column = new Column(table, impl.columnName);
  let condition: Condition;
  if (impl.array) {
    condition = new Condition(column, 'ARRAY_OVERLAPS_AND_IS_NOT_NULL', [value], 'TEXT[]');
  } else {
    condition = new Condition(column, '=', value);
  }
  return condition;
}

/**
 * From the dateTime regex on {@link https://hl7.org/fhir/R4/datatypes.html#primitive}, but with:
 * - year and month required
 * - seconds optional when minutes specified for backwards compatibility, e.g. 1985-11-30T05:05Z
 * - A space is allowed instead of a T as the date/time separator
 */
const supportedDateRegex =
  /^(\d(\d(\d[1-9]|[1-9]0)|[1-9]00)|[1-9]000)-(0[1-9]|1[0-2])-(0[1-9]|[1-2]\d|3[0-1])([T ]([01]\d|2[0-3])(:[0-5]\d(:([0-5]\d|60))?(\.\d{1,9})?)?)?(Z|[+-]((0\d|1[0-3]):[0-5]\d|14:00)?)?$/;

/**
 * Perform validation on date or dateTime values to ensure compatibility with Postgres timestamp parsing.
 * Throws a badRequest OperationOutcomeError if the value is invalid.
 * @param value - The date or dateTime value to validate.
 */
function validateDateValue(value: string): void {
  if (!supportedDateRegex.test(value)) {
    throw new OperationOutcomeError(badRequest(`Invalid date value: ${value}`));
  }

  const dateValue = new Date(value);
  if (isNaN(dateValue.getTime())) {
    throw new OperationOutcomeError(badRequest(`Invalid date value: ${value}`));
  }
}

/**
 * Adds a date or date/time search filter.
 * @param table - The resource table name.
 * @param impl - The search parameter implementation info.
 * @param filter - The search filter.
 * @returns The select query condition.
 */
export function buildDateSearchFilter(
  table: string,
  impl: ColumnSearchParameterImplementation,
  filter: Filter
): Expression {
  if (filter.operator === Operator.IN || filter.operator === Operator.NOT_IN) {
    throw new OperationOutcomeError(invalidSearchOperator(filter.operator, filter.code));
  }
  validateDateValue(filter.value);

  if (table === 'MeasureReport' && impl.columnName === 'period') {
    // Handle special case for "MeasureReport.period"
    // This is a trial for using "tstzrange" columns for date/time ranges.
    // Eventually, this special case will go away, and this will become the default behavior for all "date" search parameters.
    // See Postgres Range Types: https://www.postgresql.org/docs/current/rangetypes.html
    // See FHIR "date" search: https://hl7.org/fhir/r4/search.html#date
    const column = new Column(table, 'period_range');
    const period = toPeriod(filter.value);
    if (!period) {
      throw new OperationOutcomeError(badRequest(`Invalid period value: ${filter.value}`));
    }
    const periodRangeString = periodToRangeString(period);
    if (!periodRangeString) {
      throw new OperationOutcomeError(badRequest(`Invalid period value: ${filter.value}`));
    }
    switch (filter.operator) {
      case Operator.EQUALS:
        return new Condition(column, 'RANGE_OVERLAPS', periodRangeString);
      case Operator.NOT:
      case Operator.NOT_EQUALS:
        return new Negation(new Condition(column, 'RANGE_OVERLAPS', periodRangeString));
      case Operator.LESS_THAN:
        return new Condition(column, 'RANGE_OVERLAPS', `(,${period.end})`, ColumnType.TSTZRANGE);
      case Operator.LESS_THAN_OR_EQUALS:
        return new Condition(column, 'RANGE_OVERLAPS', `(,${period.end}]`, ColumnType.TSTZRANGE);
      case Operator.GREATER_THAN:
        return new Condition(column, 'RANGE_OVERLAPS', `(${period.start},)`, ColumnType.TSTZRANGE);
      case Operator.GREATER_THAN_OR_EQUALS:
        return new Condition(column, 'RANGE_OVERLAPS', `[${period.start},)`, ColumnType.TSTZRANGE);
      case Operator.STARTS_AFTER:
        return new Condition(column, 'RANGE_STRICTLY_RIGHT_OF', periodRangeString, ColumnType.TSTZRANGE);
      case Operator.ENDS_BEFORE:
        return new Condition(column, 'RANGE_STRICTLY_LEFT_OF', periodRangeString, ColumnType.TSTZRANGE);
      default:
        throw new Error(`Unknown FHIR operator: ${filter.operator}`);
    }
  }

  return new Condition(new Column(table, impl.columnName), fhirOperatorToSqlOperator(filter.operator), filter.value);
}

/**
 * Builds a quantity search filter.
 * @param table - The resource table name.
 * @param impl - The search parameter implementation info.
 * @param filter - The search filter.
 * @returns The select query condition.
 */
function buildQuantitySearchFilter(
  table: string,
  impl: ColumnSearchParameterImplementation,
  filter: Filter
): Expression {
  const [number, _system, _code] = splitN(filter.value, '|', 3);
  if (!number) {
    throw new OperationOutcomeError(badRequest('Invalid quantity value: ' + filter.value));
  }

  if (filter.operator === Operator.APPROXIMATELY) {
    // Search for operators within 10% of the value
    // See: https://hl7.org/fhir/R4/search.html#prefix
    // 	 The value for the parameter in the resource is approximately the same to the provided value.
    //   Note that the recommended value for the approximation is 10% of the stated value
    //   (or for a date, 10% of the gap between now and the date), but systems may choose other values where appropriate
    const numberValue = parseFloat(number);
    return new Conjunction([
      new Condition(new Column(table, impl.columnName), '>=', numberValue * 0.9),
      new Condition(new Column(table, impl.columnName), '<=', numberValue * 1.1),
    ]);
  }

  return new Condition(new Column(table, impl.columnName), fhirOperatorToSqlOperator(filter.operator), number);
}

/**
 * Adds all "order by" clauses to the query builder.
 * @param repo - The repository.
 * @param builder - The client query builder.
 * @param searchRequest - The search request.
 */
function addSortRules(repo: Repository, builder: SelectQuery, searchRequest: SearchRequest): void {
  searchRequest.sortRules?.forEach((sortRule) => addOrderByClause(repo, builder, searchRequest, sortRule));
}

/**
 * Adds a single "order by" clause to the query builder.
 * @param repo - The repository.
 * @param builder - The client query builder.
 * @param searchRequest - The search request.
 * @param sortRule - The sort rule.
 */
function addOrderByClause(
  repo: Repository,
  builder: SelectQuery,
  searchRequest: SearchRequest,
  sortRule: SortRule
): void {
  if (sortRule.code === '_id') {
    builder.orderBy('id', !!sortRule.descending);
    return;
  }

  if (sortRule.code === '_lastUpdated') {
    builder.orderBy('lastUpdated', !!sortRule.descending);
    return;
  }

  const resourceType = searchRequest.resourceType;
  const param = getSearchParameter(resourceType, sortRule.code);
  if (!param?.code) {
    throw new OperationOutcomeError(badRequest('Unknown search parameter: ' + sortRule.code));
  }

  const impl = getSearchParameterImplementation(resourceType, param);
  if (impl.searchStrategy === 'token-column') {
    addTokenColumnsOrderBy(builder, impl, sortRule);
  } else if (impl.searchStrategy === 'lookup-table') {
    impl.lookupTable.addOrderBy(builder, impl, resourceType, sortRule);
  } else {
    impl satisfies ColumnSearchParameterImplementation;
    builder.orderBy(impl.columnName, sortRule.descending);
  }
}

/**
 * Converts a FHIR search operator into a SQL operator.
 * Only works for simple conversions.
 * For complex conversions, need to build custom SQL.
 * @param fhirOperator - The FHIR operator.
 * @returns The equivalent SQL operator.
 */
function fhirOperatorToSqlOperator(fhirOperator: Operator): keyof typeof SQL {
  switch (fhirOperator) {
    case Operator.EQUALS:
    case Operator.EXACT:
      return '=';
    case Operator.NOT:
    case Operator.NOT_EQUALS:
      return '!=';
    case Operator.GREATER_THAN:
    case Operator.STARTS_AFTER:
      return '>';
    case Operator.GREATER_THAN_OR_EQUALS:
      return '>=';
    case Operator.LESS_THAN:
    case Operator.ENDS_BEFORE:
      return '<';
    case Operator.LESS_THAN_OR_EQUALS:
      return '<=';
    default:
      throw new Error(`Unknown FHIR operator: ${fhirOperator}`);
  }
}

function buildEqualityCondition(
  impl: ColumnSearchParameterImplementation,
  values: string[],
  column?: Column | string
): Condition {
  column = column ?? impl.columnName;
  if (impl.array) {
    return new Condition(column, 'ARRAY_OVERLAPS_AND_IS_NOT_NULL', values, impl.type + '[]');
  } else if (values.length > 1) {
    return new Condition(column, 'IN', values, impl.type);
  } else {
    return new Condition(column, '=', values[0], impl.type);
  }
}

function buildChainedSearch(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: string,
  param: ChainedSearchParameter
): Expression {
  if (param.chain.length > 3) {
    throw new OperationOutcomeError(badRequest('Search chains longer than three links are not currently supported'));
  }

  // Special case: single-link chain of the form param._id=<id> can be rewritten as param=ResourceType/<id>
  // Note that this does slightly change the behavior of the search query: true chained search would require the
  // reference to point to an existing resource, while the rewritten query just matches the reference string
  if (param.chain.length === 1 && param.filter?.code === '_id' && param.chain[0].direction === Direction.FORWARD) {
    const { targetType, code } = param.chain[0];
    const targetId = param.filter.value;
    return buildSearchFilterExpression(repo, selectQuery, resourceType as ResourceType, resourceType, {
      code,
      operator: Operator.EQUALS,
      value: `${targetType}/${targetId}`,
    });
  }

  return buildChainedSearchUsingReferenceTable(repo, selectQuery, param);
}

/**
 * Builds a chained search using reference tables.
 * This is the preferred technique for chained searches.
 * However, reference tables were only populated after Medplum version 2.2.0.
 * Self-hosted servers need to run a full re-index before this technique can be used.
 * @param repo - The repository.
 * @param selectQuery - The select query builder.
 * @param param - The chained search parameter.
 * @returns The WHERE clause expression for the final chained filter.
 */
function buildChainedSearchUsingReferenceTable(
  repo: Repository,
  selectQuery: SelectQuery,
  param: ChainedSearchParameter
): Expression {
  let link = param.chain[0];
  let currentTable = nextChainedTable(link);

  // Set up subquery for EXISTS(), starting on the first link of the chain
  let innerQuery: SelectQuery;
  if (link.implementation.type === SearchParameterType.CANONICAL) {
    innerQuery = new SelectQuery(currentTable).whereExpr(
      getCanonicalJoinCondition(selectQuery.effectiveTableName, link, currentTable)
    );
  } else {
    innerQuery = new SelectQuery(currentTable).whereExpr(
      lookupTableJoinCondition(selectQuery.effectiveTableName, link, currentTable)
    );
    currentTable = linkLiteralReference(innerQuery, currentTable, link);
  }

  // Add joins to inner query for all subsequent chain links
  for (let i = 1; i < param.chain.length; i++) {
    link = param.chain[i];
    if (link.implementation.type === SearchParameterType.CANONICAL) {
      currentTable = linkCanonicalReference(innerQuery, currentTable, link);
    } else {
      const lookupTable = linkReferenceLookupTable(innerQuery, currentTable, link);
      currentTable = linkLiteralReference(innerQuery, lookupTable, link);
    }
  }

  // Add terminal conditions on final target table, and return EXISTS() over subquery
  innerQuery
    .where(new Column(currentTable, 'id'), '!=', null)
    .whereExpr(
      buildSearchFilterExpression(repo, innerQuery, link.targetType as ResourceType, currentTable, param.filter)
    );
  return new SqlFunction('EXISTS', [innerQuery]);
}

/**
 * Join a query to the next table via canonical reference (i.e. by `url`).
 * @param selectQuery - The query to which the join will be added.
 * @param currentTable - The "current" table in the chained search construction.
 * @param link - The current link of the chained search.
 * @returns The next table alias.
 */
function linkCanonicalReference(selectQuery: SelectQuery, currentTable: string, link: ChainedSearchLink): string {
  const nextTable = selectQuery.getNextJoinAlias();
  const join = getCanonicalJoinCondition(currentTable, link, nextTable);
  selectQuery.join('LEFT JOIN', nextChainedTable(link), nextTable, join);
  return nextTable;
}

/**
 * Join a query to a reference lookup table for chained search.
 * @param selectQuery - The query to which the join will be added.
 * @param currentTable - The "current" table in the chained search construction.
 * @param link - The current link of the chained search.
 * @returns The next table alias.
 */
function linkReferenceLookupTable(selectQuery: SelectQuery, currentTable: string, link: ChainedSearchLink): string {
  const referenceTable = selectQuery.getNextJoinAlias();
  selectQuery.join(
    'LEFT JOIN',
    nextChainedTable(link),
    referenceTable,
    lookupTableJoinCondition(currentTable, link, referenceTable)
  );
  return referenceTable;
}

/**
 * Join a query to the next resource table for chained search.
 * @param selectQuery - The query to which the join will be added.
 * @param lookupTable - The "current" table in the chained search construction, assumed to be a reference lookup table.
 * @param link - The current link of the chained search.
 * @returns The next table alias.
 */
function linkLiteralReference(selectQuery: SelectQuery, lookupTable: string, link: ChainedSearchLink): string {
  const nextColumn = link.direction === Direction.FORWARD ? 'targetId' : 'resourceId';
  const nextTable = selectQuery.getNextJoinAlias();
  selectQuery.join(
    'LEFT JOIN',
    link.targetType,
    nextTable,
    new Condition(new Column(nextTable, 'id'), '=', new Column(lookupTable, nextColumn))
  );

  return nextTable;
}

function getCanonicalJoinCondition(currentTable: string, link: ChainedSearchLink, nextTable: string): Expression {
  let sourceTable: string, targetTable: string, targetType: string;
  if (link.direction === Direction.FORWARD) {
    sourceTable = currentTable;
    targetTable = nextTable;
    targetType = link.targetType;
  } else {
    sourceTable = nextTable;
    targetTable = currentTable;
    targetType = link.originType;
  }

  if (!getSearchParameter(targetType, 'url')) {
    throw new OperationOutcomeError(
      badRequest(`${targetTable} cannot be chained via canonical reference (${sourceTable}:${link.code})`)
    );
  }

  const eq = link.implementation.array ? 'IN_SUBQUERY' : '=';
  return new Condition(new Column(targetTable, 'url'), eq, new Column(sourceTable, link.implementation.columnName));
}

function nextChainedTable(link: ChainedSearchLink): string {
  if (link.implementation.type === SearchParameterType.CANONICAL) {
    return link.targetType;
  } else if (link.direction === Direction.FORWARD) {
    return `${link.originType}_References`;
  } else {
    return `${link.targetType}_References`;
  }
}

/**
 * Constructs the condition for joining a resource table to a reference lookup table for chained search.
 * @param currentTable - The "current" table in the chained search construction, assumed to be a resource table.
 * @param link - The current link of the chained search.
 * @param nextTable - The reference lookup table next in the chained search.
 * @returns The expression relating the two tables, which can be used as a JOIN condition or in a WHERE clause.
 */
function lookupTableJoinCondition(currentTable: string, link: ChainedSearchLink, nextTable: string): Expression {
  const column = link.direction === Direction.FORWARD ? 'resourceId' : 'targetId';
  return new Conjunction([
    new Condition(new Column(nextTable, column), '=', new Column(currentTable, 'id')),
    new Condition(new Column(nextTable, 'code'), '=', link.code),
  ]);
}

function parseChainedParameter(resourceType: string, searchFilter: Filter): ChainedSearchParameter {
  let currentResourceType = resourceType;
  const parts = splitChainedSearch(searchFilter.code);

  const chain: ChainedSearchLink[] = [];
  let filter: Filter | undefined;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('_has')) {
      const link = parseReverseChainLink(part, currentResourceType);
      chain.push(link);
      currentResourceType = link.targetType;
    } else if (i === parts.length - 1) {
      const [code, modifier] = splitN(part, ':', 2);
      if (code === '_filter') {
        filter = { code: '_filter', operator: Operator.EQUALS, value: searchFilter.value };
      } else {
        const searchParam = getSearchParameter(currentResourceType, code);
        if (!searchParam) {
          throw new Error(`Invalid search parameter at end of chain: ${currentResourceType}?${code}`);
        }
        filter = parseParameter(searchParam, modifier ?? searchFilter.operator, searchFilter.value);
      }
    } else {
      const link = parseChainLink(part, currentResourceType);
      chain.push(link);
      currentResourceType = link.targetType;
    }
  }

  if (!filter) {
    throw new OperationOutcomeError(badRequest('Unterminated chained search'));
  }

  return { chain, filter };
}

function parseChainLink(param: string, currentResourceType: string): ChainedSearchLink {
  const [code, modifier] = splitN(param, ':', 2);
  const searchParam = getSearchParameter(currentResourceType, code);
  if (!searchParam) {
    throw new Error(`Invalid search parameter in chain: ${currentResourceType}?${code}`);
  }
  let targetType: string;
  if (searchParam.target?.length === 1) {
    targetType = searchParam.target[0];
  } else if (searchParam.target?.includes(modifier as ResourceType)) {
    targetType = modifier;
  } else {
    throw new Error(`Unable to identify next resource type for search parameter: ${currentResourceType}?${code}`);
  }
  const implementation = getSearchParameterImplementation(currentResourceType, searchParam);
  if (implementation.searchStrategy !== 'column') {
    throw new Error(`Invalid search parameter in chain: ${currentResourceType}?${code}`);
  }
  return { originType: currentResourceType, targetType, code, implementation, direction: Direction.FORWARD };
}

function parseReverseChainLink(param: string, targetResourceType: string): ChainedSearchLink {
  const [, resourceType, code] = splitN(param, ':', 3);
  const searchParam = getSearchParameter(resourceType, code);
  if (!searchParam) {
    throw new Error(`Invalid search parameter in chain: ${resourceType}?${code}`);
  } else if (!searchParam.target?.includes(targetResourceType as ResourceType)) {
    throw new Error(
      `Invalid reverse chain link: search parameter ${resourceType}?${code} does not refer to ${targetResourceType}`
    );
  }
  const implementation = getSearchParameterImplementation(resourceType, searchParam);
  if (implementation.searchStrategy !== 'column') {
    throw new Error(`Invalid search parameter in chain: ${resourceType}?${code}`);
  }
  return {
    originType: targetResourceType,
    targetType: resourceType,
    code,
    implementation,
    direction: Direction.REVERSE,
  };
}

function splitChainedSearch(chain: string): string[] {
  const params: string[] = [];
  while (chain) {
    const peek = chain.slice(0, 5);
    if (peek === '_has:') {
      const resourceTypeDelim = chain.indexOf(':', 5);
      const codeDelim = chain.indexOf(':', resourceTypeDelim + 1);
      if (resourceTypeDelim < 0 || resourceTypeDelim >= codeDelim) {
        throw new Error('Invalid search chain: ' + chain);
      }
      params.push(chain.slice(0, codeDelim));
      chain = chain.slice(codeDelim + 1);
    } else {
      let nextDot = chain.indexOf('.');
      if (nextDot === -1) {
        nextDot = chain.length;
      }
      params.push(chain.slice(0, nextDot));
      chain = chain.slice(nextDot + 1);
    }
  }
  return params;
}

function getCanonicalUrl(resource: Resource): string | undefined {
  return (resource as Resource & { url?: string }).url;
}
