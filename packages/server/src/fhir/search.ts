import {
  badRequest,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  evalFhirPathTyped,
  FhirFilterComparison,
  FhirFilterConnective,
  FhirFilterExpression,
  FhirFilterNegation,
  Filter,
  forbidden,
  formatSearchQuery,
  getDataType,
  getReferenceString,
  getSearchParameter,
  getSearchParameterDetails,
  IncludeTarget,
  isResource,
  OperationOutcomeError,
  Operator,
  parseFilterParameter,
  parseParameter,
  PropertyType,
  SearchParameterDetails,
  SearchParameterType,
  SearchRequest,
  SortRule,
  splitN,
  splitSearchOnComma,
  subsetResource,
  toPeriod,
  toTypedValue,
  validateResourceType,
} from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  BundleLink,
  Reference,
  Resource,
  ResourceType,
  SearchParameter,
} from '@medplum/fhirtypes';
import validator from 'validator';
import { getConfig } from '../config';
import { getLogger } from '../context';
import { DatabaseMode } from '../database';
import { deriveIdentifierSearchParameter } from './lookups/util';
import { getLookupTable, Repository } from './repo';
import { getFullUrl } from './response';
import {
  ArraySubquery,
  Column,
  ColumnType,
  Condition,
  Conjunction,
  Disjunction,
  Expression,
  Negation,
  periodToRangeString,
  SelectQuery,
  Operator as SQL,
  SqlBuilder,
  Union,
} from './sql';

/**
 * Defines the maximum number of resources returned in a single search result.
 */
const maxSearchResults = DEFAULT_MAX_SEARCH_COUNT;

export interface ChainedSearchLink {
  resourceType: string;
  code: string;
  details: SearchParameterDetails;
  reverse?: boolean;
  filter?: Filter;
}

export interface ChainedSearchParameter {
  chain: ChainedSearchLink[];
}

export async function searchImpl<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest<T>
): Promise<Bundle<T>> {
  validateSearchResourceTypes(repo, searchRequest);

  // Ensure that "count" is set.
  // Count is an optional field.  From this point on, it is safe to assume it is a number.
  if (searchRequest.count === undefined) {
    searchRequest.count = DEFAULT_SEARCH_COUNT;
  } else if (searchRequest.count > maxSearchResults) {
    searchRequest.count = maxSearchResults;
  }

  let entry = undefined;
  let rowCount = undefined;
  let hasMore = false;
  if (searchRequest.count > 0) {
    ({ entry, rowCount, hasMore } = await getSearchEntries<T>(repo, searchRequest));
  }

  let total = undefined;
  if (searchRequest.total === 'accurate' || searchRequest.total === 'estimate') {
    total = await getCount(repo, searchRequest, rowCount);
  }

  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry,
    total,
    link: getSearchLinks(searchRequest, hasMore),
  };
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

  if (!repo.canReadResourceType(resourceType)) {
    throw new OperationOutcomeError(forbidden);
  }
}

/**
 * Returns the bundle entries for a search request.
 * @param repo - The repository.
 * @param searchRequest - The search request.
 * @returns The bundle entries for the search result.
 */
async function getSearchEntries<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest
): Promise<{ entry: BundleEntry<T>[]; rowCount: number; hasMore: boolean }> {
  const builder = getBaseSelectQuery(repo, searchRequest);

  addSortRules(builder, searchRequest);

  const startTime = Date.now();
  const count = searchRequest.count as number;
  builder.limit(count + 1); // Request one extra to test if there are more results
  builder.offset(searchRequest.offset || 0);

  const rows = await builder.execute(repo.getDatabaseClient(DatabaseMode.READER));
  const endTime = Date.now();
  const rowCount = rows.length;
  const resources = rows.slice(0, count).map((row) => JSON.parse(row.content as string)) as T[];
  const entries = resources.map(
    (resource) =>
      ({
        fullUrl: getFullUrl(resource.resourceType, resource.id as string),
        resource,
      }) as BundleEntry
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

  const duration = endTime - startTime;
  const threshold = getConfig().slowQueryThresholdMilliseconds;
  if (threshold !== undefined && duration > threshold) {
    builder.explain = true;
    builder.analyzeBuffers = true;
    const sqlBuilder = new SqlBuilder();
    const sql = builder.buildSql(sqlBuilder);
    const explainRows = await builder.execute(repo.getDatabaseClient(DatabaseMode.READER));
    const explain = explainRows.map((row) => row['QUERY PLAN']).join('\n');
    getLogger().warn('Slow search query', { duration, searchRequest, sql, explain });
  }

  return {
    entry: entries as BundleEntry<T>[],
    rowCount,
    hasMore: rows.length > count,
  };
}

function getBaseSelectQuery(repo: Repository, searchRequest: SearchRequest, addColumns = true): SelectQuery {
  let builder: SelectQuery;
  if (searchRequest.types) {
    const queries: SelectQuery[] = [];
    for (const resourceType of searchRequest.types) {
      queries.push(getBaseSelectQueryForResourceType(repo, resourceType, searchRequest, addColumns));
    }
    builder = new SelectQuery('combined', new Union(...queries));
    if (addColumns) {
      builder.column('id').column('content');
    }
  } else {
    builder = getBaseSelectQueryForResourceType(repo, searchRequest.resourceType, searchRequest, addColumns);
  }
  return builder;
}

function getBaseSelectQueryForResourceType(
  repo: Repository,
  resourceType: ResourceType,
  searchRequest: SearchRequest,
  addColumns = true
): SelectQuery {
  const builder = new SelectQuery(resourceType);
  if (addColumns) {
    builder
      .column({ tableName: resourceType, columnName: 'id' })
      .column({ tableName: resourceType, columnName: 'content' });
  }
  repo.addDeletedFilter(builder);
  repo.addSecurityFilters(builder, resourceType);
  addSearchFilters(repo, builder, resourceType, searchRequest);
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
  let base = resources;
  let iterateOnly = false;
  const seen: Record<string, boolean> = {};
  resources.forEach((r) => {
    seen[`${r.resourceType}/${r.id}`] = true;
  });
  let depth = 0;
  while (base.length > 0) {
    // Circuit breaker / load limit
    if (depth >= 5 || entries.length > 1000) {
      throw new Error(`Search with _(rev)include reached query scope limit: depth=${depth}, results=${entries.length}`);
    }

    const includes =
      searchRequest.include
        ?.filter((param) => !iterateOnly || param.modifier === Operator.ITERATE)
        ?.map((param) => getSearchIncludeEntries(repo, param, base)) || [];

    const revincludes =
      searchRequest.revInclude
        ?.filter((param) => !iterateOnly || param.modifier === Operator.ITERATE)
        ?.map((param) => getSearchRevIncludeEntries(repo, param, base)) || [];

    const includedResources = (await Promise.all([...includes, ...revincludes])).flat();
    includedResources.forEach((r) => {
      const ref = `${r.resource?.resourceType}/${r.resource?.id}`;
      if (!seen[ref]) {
        entries.push(r);
      }
      seen[ref] = true;
    });
    base = includedResources.map((entry) => entry.resource) as T[];
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
  const searchParam = getSearchParameter(include.resourceType, include.searchParam);
  if (!searchParam) {
    throw new OperationOutcomeError(
      badRequest(`Invalid include parameter: ${include.resourceType}:${include.searchParam}`)
    );
  }

  const fhirPathResult = evalFhirPathTyped(searchParam.expression as string, resources.map(toTypedValue));

  const references = fhirPathResult
    .filter((typedValue) => typedValue.type === PropertyType.Reference)
    .map((typedValue) => typedValue.value as Reference);
  const readResult = await repo.readReferences(references);
  const includedResources = readResult.filter(isResource);

  const canonicalReferences = fhirPathResult
    .filter((typedValue) => ([PropertyType.canonical, PropertyType.uri] as string[]).includes(typedValue.type))
    .map((typedValue) => typedValue.value as string);
  if (canonicalReferences.length > 0) {
    const canonicalSearches = (searchParam.target || []).map((resourceType) =>
      getSearchEntries(repo, {
        resourceType: resourceType,
        filters: [
          {
            code: 'url',
            operator: Operator.EQUALS,
            value: canonicalReferences.join(','),
          },
        ],
      })
    );
    (await Promise.all(canonicalSearches)).forEach((result) => {
      includedResources.push(...result.entry.map((e) => e.resource as Resource));
    });
  }

  return includedResources.map((resource) => ({
    fullUrl: getFullUrl(resource.resourceType, resource.id as string),
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
  const searchParam = getSearchParameter(revInclude.resourceType, revInclude.searchParam);
  if (!searchParam) {
    throw new OperationOutcomeError(
      badRequest(`Invalid include parameter: ${revInclude.resourceType}:${revInclude.searchParam}`)
    );
  }

  const paramDetails = getSearchParameterDetails(revInclude.resourceType, searchParam);
  let value: string;
  if (paramDetails.type === SearchParameterType.CANONICAL) {
    value = resources
      .map((r) => (r as any).url)
      .filter((u) => u !== undefined)
      .join(',');
  } else {
    value = resources.map(getReferenceString).join(',');
  }

  return (
    await getSearchEntries(repo, {
      resourceType: revInclude.resourceType as ResourceType,
      filters: [
        {
          code: revInclude.searchParam,
          operator: Operator.EQUALS,
          value: value,
        },
      ],
    })
  ).entry;
}

/**
 * Returns the search bundle links for a search request.
 * At minimum, the 'self' link will be returned.
 * If "count" does not equal zero, then 'first', 'next', and 'previous' links will be included.
 * @param searchRequest - The search request.
 * @param hasMore - True if there are more entries after the current page.
 * @returns The search bundle links.
 */
function getSearchLinks(searchRequest: SearchRequest, hasMore: boolean | undefined): BundleLink[] {
  const result: BundleLink[] = [
    {
      relation: 'self',
      url: getSearchUrl(searchRequest),
    },
  ];

  const count = searchRequest.count as number;
  if (count > 0) {
    const offset = searchRequest.offset || 0;

    result.push({
      relation: 'first',
      url: getSearchUrl({ ...searchRequest, offset: 0 }),
    });

    if (hasMore) {
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

  return result;
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
async function getCount(repo: Repository, searchRequest: SearchRequest, rowCount: number | undefined): Promise<number> {
  const estimateCount = await getEstimateCount(repo, searchRequest, rowCount);
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
  const builder = getBaseSelectQuery(repo, searchRequest, false);

  if (builder.joins.length > 0) {
    builder.raw(`COUNT (DISTINCT "${searchRequest.resourceType}"."id")::int AS "count"`);
  } else {
    builder.raw('COUNT("id")::int AS "count"');
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
 * @param rowCount - The number of matching results if found.
 * @returns The total number of matching results.
 */
async function getEstimateCount(
  repo: Repository,
  searchRequest: SearchRequest,
  rowCount: number | undefined
): Promise<number> {
  const builder = getBaseSelectQuery(repo, searchRequest);
  builder.explain = true;

  // See: https://wiki.postgresql.org/wiki/Count_estimate
  // This parses the query plan to find the estimated number of rows.
  const rows = await builder.execute(repo.getDatabaseClient(DatabaseMode.READER));
  let result = 0;
  for (const row of rows) {
    const queryPlan = row['QUERY PLAN'];
    const match = /rows=(\d+)/.exec(queryPlan);
    if (match) {
      result = parseInt(match[1], 10);
      break;
    }
  }

  return clampEstimateCount(searchRequest, rowCount, result);
}

/**
 * Returns a "clamped" estimate count based on the actual row count.
 * @param searchRequest - The search request.
 * @param rowCount - The number of matching results if found. Value can be up to one more than the requested count.
 * @param estimateCount - The estimated number of matching results.
 * @returns The clamped estimate count.
 */
export function clampEstimateCount(
  searchRequest: SearchRequest,
  rowCount: number | undefined,
  estimateCount: number
): number {
  if (searchRequest.count === 0 || rowCount === undefined) {
    // If "count only" or rowCount is undefined, then the estimate is the best we can do
    return estimateCount;
  }

  const pageSize = searchRequest.count ?? DEFAULT_SEARCH_COUNT;
  const startIndex = searchRequest.offset ?? 0;
  const minCount = rowCount > 0 ? startIndex + rowCount : 0;
  const maxCount = rowCount <= pageSize ? startIndex + rowCount : Number.MAX_SAFE_INTEGER;
  return Math.max(minCount, Math.min(maxCount, estimateCount));
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
      if (filter.code.startsWith('_has:') || filter.code.includes('.')) {
        const chain = parseChainedParameter(searchRequest.resourceType, filter.code, filter.value);
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

  if (filter.code.startsWith('_has:') || filter.code.includes('.')) {
    const chain = parseChainedParameter(resourceType, filter.code, filter.value);
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

  const lookupTable = getLookupTable(resourceType, param);
  if (lookupTable) {
    return lookupTable.buildWhere(selectQuery, resourceType, table, filter);
  }

  // Not any special cases, just a normal search parameter.
  return buildNormalSearchFilterExpression(repo, resourceType, table, param, filter);
}

/**
 * Builds a search filter expression for a normal search parameter.
 *
 * Not any special cases, just a normal search parameter.
 * @param repo - The repository.
 * @param resourceType - The FHIR resource type.
 * @param table - The resource table.
 * @param param - The FHIR search parameter.
 * @param filter - The search filter.
 * @returns A SQL "WHERE" clause expression.
 */
function buildNormalSearchFilterExpression(
  repo: Repository,
  resourceType: string,
  table: string,
  param: SearchParameter,
  filter: Filter
): Expression {
  const details = getSearchParameterDetails(resourceType, param);
  if (filter.operator === Operator.MISSING) {
    return new Condition(new Column(table, details.columnName), filter.value === 'true' ? '=' : '!=', null);
  } else if (filter.operator === Operator.PRESENT) {
    return new Condition(new Column(table, details.columnName), filter.value === 'true' ? '!=' : '=', null);
  } else if (param.type === 'string') {
    return buildStringSearchFilter(table, details, filter.operator, splitSearchOnComma(filter.value));
  } else if (param.type === 'token' || param.type === 'uri') {
    return buildTokenSearchFilter(table, details, filter.operator, splitSearchOnComma(filter.value));
  } else if (param.type === 'reference') {
    return buildReferenceSearchFilter(table, details, filter.operator, splitSearchOnComma(filter.value));
  } else if (param.type === 'date') {
    return buildDateSearchFilter(table, details, filter);
  } else if (param.type === 'quantity') {
    return new Condition(
      new Column(table, details.columnName),
      fhirOperatorToSqlOperator(filter.operator),
      filter.value
    );
  } else {
    const values = splitSearchOnComma(filter.value).map(
      (v) => new Condition(new Column(undefined, details.columnName), fhirOperatorToSqlOperator(filter.operator), v)
    );
    const expr = new Disjunction(values);
    return details.array ? new ArraySubquery(new Column(undefined, details.columnName), expr) : expr;
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
        { columnName: 'id', type: SearchParameterType.UUID },
        filter.operator,
        splitSearchOnComma(filter.value)
      );
    case '_lastUpdated':
      return buildDateSearchFilter(table, { type: SearchParameterType.DATETIME, columnName: 'lastUpdated' }, filter);
    case '_compartment':
    case '_project':
      return buildIdSearchFilter(
        table,
        { columnName: 'compartments', type: SearchParameterType.UUID, array: true },
        filter.operator,
        splitSearchOnComma(filter.value)
      );
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
 * @param details - The search parameter details.
 * @param operator - The search operator.
 * @param values - The string values to search against.
 * @returns The select query condition.
 */
function buildStringSearchFilter(
  table: string,
  details: SearchParameterDetails,
  operator: Operator,
  values: string[]
): Expression {
  const column = new Column(details.array ? undefined : table, details.columnName);

  const expression = buildStringFilterExpression(column, operator, values);
  if (details.array) {
    return new ArraySubquery(new Column(table, details.columnName), expression);
  }
  return expression;
}

function buildStringFilterExpression(column: Column, operator: Operator, values: string[]): Expression {
  const conditions = values.map((v) => {
    if (operator === Operator.EXACT) {
      return new Condition(column, '=', v);
    } else if (operator === Operator.CONTAINS) {
      return new Condition(column, 'LIKE', `%${v}%`);
    } else {
      return new Condition(column, 'LIKE', `${v}%`);
    }
  });
  return new Disjunction(conditions);
}

/**
 * Adds an ID search filter as "WHERE" clause to the query builder.
 * @param table - The resource table name or alias.
 * @param details - The search parameter details.
 * @param operator - The search operator.
 * @param values - The string values to search against.
 * @returns The select query condition.
 */
function buildIdSearchFilter(
  table: string,
  details: SearchParameterDetails,
  operator: Operator,
  values: string[]
): Expression {
  const column = new Column(table, details.columnName);

  for (let i = 0; i < values.length; i++) {
    if (values[i].includes('/')) {
      values[i] = values[i].split('/').pop() as string;
    }
    if (!validator.isUUID(values[i])) {
      values[i] = '00000000-0000-0000-0000-000000000000';
    }
  }

  const condition = buildEqualityCondition(details, values, column);
  if (operator === Operator.NOT_EQUALS || operator === Operator.NOT) {
    return new Negation(condition);
  }
  return condition;
}

/**
 * Adds a token search filter as "WHERE" clause to the query builder.
 * @param table - The resource table.
 * @param details - The search parameter details.
 * @param operator - The search operator.
 * @param values - The string values to search against.
 * @returns The select query condition.
 */
function buildTokenSearchFilter(
  table: string,
  details: SearchParameterDetails,
  operator: Operator,
  values: string[]
): Expression {
  const column = new Column(table, details.columnName);
  const condition = buildEqualityCondition(details, values, column);
  if (operator === Operator.NOT_EQUALS || operator === Operator.NOT) {
    return new Negation(condition);
  }
  return condition;
}

/**
 * Adds a reference search filter as "WHERE" clause to the query builder.
 * @param table - The table in which to search.
 * @param details - The search parameter details.
 * @param operator - The search operator.
 * @param values - The string values to search against.
 * @returns The select query condition.
 */
function buildReferenceSearchFilter(
  table: string,
  details: SearchParameterDetails,
  operator: Operator,
  values: string[]
): Expression {
  const column = new Column(table, details.columnName);
  values = values.map((v) =>
    !v.includes('/') && (details.columnName === 'subject' || details.columnName === 'patient') ? `Patient/${v}` : v
  );
  let condition: Condition;
  if (details.array) {
    condition = new Condition(column, 'ARRAY_CONTAINS', values, 'TEXT[]');
  } else if (values.length === 1) {
    condition = new Condition(column, '=', values[0]);
  } else {
    condition = new Condition(column, 'IN', values);
  }
  return operator === Operator.NOT || operator === Operator.NOT_EQUALS ? new Negation(condition) : condition;
}

/**
 * Adds a date or date/time search filter.
 * @param table - The resource table name.
 * @param details - The search parameter details.
 * @param filter - The search filter.
 * @returns The select query condition.
 */
function buildDateSearchFilter(table: string, details: SearchParameterDetails, filter: Filter): Expression {
  const dateValue = new Date(filter.value);
  if (isNaN(dateValue.getTime())) {
    throw new OperationOutcomeError(badRequest(`Invalid date value: ${filter.value}`));
  }

  if (table === 'MeasureReport' && details.columnName === 'period') {
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

  return new Condition(new Column(table, details.columnName), fhirOperatorToSqlOperator(filter.operator), filter.value);
}

/**
 * Adds all "order by" clauses to the query builder.
 * @param builder - The client query builder.
 * @param searchRequest - The search request.
 */
function addSortRules(builder: SelectQuery, searchRequest: SearchRequest): void {
  searchRequest.sortRules?.forEach((sortRule) => addOrderByClause(builder, searchRequest, sortRule));
}

/**
 * Adds a single "order by" clause to the query builder.
 * @param builder - The client query builder.
 * @param searchRequest - The search request.
 * @param sortRule - The sort rule.
 */
function addOrderByClause(builder: SelectQuery, searchRequest: SearchRequest, sortRule: SortRule): void {
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

  const lookupTable = getLookupTable(resourceType, param);
  if (lookupTable) {
    lookupTable.addOrderBy(builder, resourceType, sortRule);
    return;
  }

  const details = getSearchParameterDetails(resourceType, param);
  builder.orderBy(details.columnName, !!sortRule.descending);
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
  details: SearchParameterDetails,
  values: string[],
  column?: Column | string
): Condition {
  column = column ?? details.columnName;
  if (details.array) {
    return new Condition(column, 'ARRAY_CONTAINS', values, details.type + '[]');
  } else if (values.length > 1) {
    return new Condition(column, 'IN', values, details.type);
  } else {
    return new Condition(column, '=', values[0], details.type);
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

  if (usesReferenceLookupTable(repo)) {
    return buildChainedSearchUsingReferenceTable(repo, selectQuery, resourceType, param);
  } else {
    return buildChainedSearchUsingReferenceStrings(repo, selectQuery, resourceType, param);
  }
}

function usesReferenceLookupTable(repo: Repository): boolean {
  return !!(
    getConfig().chainedSearchWithReferenceTables || repo.currentProject()?.features?.includes('reference-lookups')
  );
}

/**
 * Builds a chained search using reference tables.
 * This is the preferred technique for chained searches.
 * However, reference tables were only populated after Medplum version 2.2.0.
 * Self-hosted servers need to run a full re-index before this technique can be used.
 * @param repo - The repository.
 * @param selectQuery - The select query builder.
 * @param resourceType - The top level resource type.
 * @param param - The chained search parameter.
 * @returns The WHERE clause expression for the final chained filter.
 */
function buildChainedSearchUsingReferenceTable(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: string,
  param: ChainedSearchParameter
): Expression {
  let currentResourceType = resourceType;
  let currentTable = resourceType;
  for (const link of param.chain) {
    let referenceTableName: string;
    let currentColumnName: string;
    let nextColumnName;

    if (link.reverse) {
      referenceTableName = `${link.resourceType}_References`;
      currentColumnName = 'targetId';
      nextColumnName = 'resourceId';
    } else {
      referenceTableName = `${currentResourceType}_References`;
      currentColumnName = 'resourceId';
      nextColumnName = 'targetId';
    }

    const referenceTableAlias = selectQuery.getNextJoinAlias();
    selectQuery.leftJoin(
      referenceTableName,
      referenceTableAlias,
      new Conjunction([
        new Condition(new Column(referenceTableAlias, currentColumnName), '=', new Column(currentTable, 'id')),
        new Condition(new Column(referenceTableAlias, 'code'), '=', link.code),
      ])
    );

    const nextTableAlias = selectQuery.getNextJoinAlias();
    selectQuery.leftJoin(
      link.resourceType,
      nextTableAlias,
      new Condition(new Column(nextTableAlias, 'id'), '=', new Column(referenceTableAlias, nextColumnName))
    );

    currentTable = nextTableAlias;
    currentResourceType = link.resourceType;

    if (link.filter) {
      return buildSearchFilterExpression(
        repo,
        selectQuery,
        link.resourceType as ResourceType,
        nextTableAlias,
        link.filter
      );
    }
  }
  throw new OperationOutcomeError(badRequest('Unterminated chained search'));
}

/**
 * Builds a chained search using reference strings.
 * The query parses a `resourceType/id` formatted string in SQL and converts the id to a UUID.
 * This is very slow and inefficient, but it is the only way to support chained searches with reference strings.
 * This technique is deprecated and intended for removal.
 * The preferred technique is to use reference tables.
 * @param repo - The repository.
 * @param selectQuery - The select query builder.
 * @param resourceType - The top level resource type.
 * @param param - The chained search parameter.
 * @returns The WHERE clause expression for the final chained filter.
 */
function buildChainedSearchUsingReferenceStrings(
  repo: Repository,
  selectQuery: SelectQuery,
  resourceType: string,
  param: ChainedSearchParameter
): Expression {
  let currentResourceType = resourceType;
  let currentTable = resourceType;
  for (const link of param.chain) {
    const nextTable = selectQuery.getNextJoinAlias();
    const joinCondition = buildSearchLinkCondition(currentResourceType, link, currentTable, nextTable);
    selectQuery.leftJoin(link.resourceType, nextTable, joinCondition);

    currentTable = nextTable;
    currentResourceType = link.resourceType;

    if (link.filter) {
      return buildSearchFilterExpression(repo, selectQuery, link.resourceType as ResourceType, nextTable, link.filter);
    }
  }
  throw new OperationOutcomeError(badRequest('Unterminated chained search'));
}

function buildSearchLinkCondition(
  resourceType: string,
  link: ChainedSearchLink,
  currentTable: string,
  nextTable: string
): Expression {
  const linkColumn = new Column(currentTable, link.details.columnName);
  if (link.reverse) {
    const nextColumn = new Column(nextTable, link.details.columnName);
    const currentColumn = new Column(currentTable, 'id');

    if (link.details.array) {
      return new ArraySubquery(
        nextColumn,
        new Condition(new Column(undefined, link.details.columnName), 'REVERSE_LINK', currentColumn, resourceType)
      );
    } else {
      return new Condition(nextColumn, 'REVERSE_LINK', currentColumn, resourceType);
    }
  } else if (link.details.array) {
    return new ArraySubquery(
      linkColumn,
      new Condition(new Column(nextTable, 'id'), 'LINK', new Column(undefined, link.details.columnName))
    );
  } else {
    return new Condition(new Column(nextTable, 'id'), 'LINK', linkColumn);
  }
}

function parseChainedParameter(resourceType: string, key: string, value: string): ChainedSearchParameter {
  const param: ChainedSearchParameter = {
    chain: [],
  };
  let currentResourceType = resourceType;

  const parts = splitChainedSearch(key);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('_has')) {
      const link = parseReverseChainLink(part, currentResourceType);
      param.chain.push(link);
      currentResourceType = link.resourceType;
    } else if (i === parts.length - 1) {
      const [code, modifier] = splitN(part, ':', 2);
      const searchParam = getSearchParameter(currentResourceType, code);
      if (!searchParam) {
        throw new Error(`Invalid search parameter at end of chain: ${currentResourceType}?${code}`);
      }
      param.chain[param.chain.length - 1].filter = parseParameter(searchParam, modifier, value);
    } else {
      const link = parseChainLink(part, currentResourceType);
      param.chain.push(link);
      currentResourceType = link.resourceType;
    }
  }
  return param;
}

function parseChainLink(param: string, currentResourceType: string): ChainedSearchLink {
  const [code, modifier] = splitN(param, ':', 2);
  const searchParam = getSearchParameter(currentResourceType, code);
  if (!searchParam) {
    throw new Error(`Invalid search parameter in chain: ${currentResourceType}?${code}`);
  }
  let resourceType: string;
  if (searchParam.target?.length === 1) {
    resourceType = searchParam.target[0];
  } else if (searchParam.target?.includes(modifier as ResourceType)) {
    resourceType = modifier;
  } else {
    throw new Error(`Unable to identify next resource type for search parameter: ${currentResourceType}?${code}`);
  }
  const details = getSearchParameterDetails(currentResourceType, searchParam);
  return { resourceType, code, details };
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
  const details = getSearchParameterDetails(resourceType, searchParam);
  return { resourceType, code, details, reverse: true };
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
