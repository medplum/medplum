import {
  badRequest,
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
  serverError,
  SortRule,
  splitN,
  subsetResource,
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
import { getClient } from '../database';
import { deriveIdentifierSearchParameter } from './lookups/util';
import { getLookupTable, Repository } from './repo';
import {
  ArraySubquery,
  Column,
  Condition,
  Conjunction,
  Disjunction,
  Expression,
  Negation,
  SelectQuery,
  Operator as SQL,
} from './sql';

/**
 * Defines the maximum number of resources returned in a single search result.
 */
const maxSearchResults = 1000;

export interface ChainedSearchLink {
  resourceType: string;
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
  const resourceType = searchRequest.resourceType;
  validateResourceType(resourceType);

  if (!repo.canReadResourceType(resourceType)) {
    throw new OperationOutcomeError(forbidden);
  }

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
  if (searchRequest.total === 'accurate') {
    total = await getAccurateCount(repo, searchRequest);
  } else if (searchRequest.total === 'estimate') {
    total = await getEstimateCount(repo, searchRequest, rowCount);
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
 * Returns the bundle entries for a search request.
 * @param repo - The repository.
 * @param searchRequest - The search request.
 * @returns The bundle entries for the search result.
 */
async function getSearchEntries<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest
): Promise<{ entry: BundleEntry<T>[]; rowCount: number; hasMore: boolean }> {
  const resourceType = searchRequest.resourceType;
  const client = getClient();
  const builder = new SelectQuery(resourceType)
    .column({ tableName: resourceType, columnName: 'id' })
    .column({ tableName: resourceType, columnName: 'content' });

  addSortRules(builder, searchRequest);
  repo.addDeletedFilter(builder);
  repo.addSecurityFilters(builder, resourceType);
  addSearchFilters(builder, searchRequest);

  if (builder.joins.length > 0) {
    builder.groupBy({ tableName: resourceType, columnName: 'id' });
  }

  const count = searchRequest.count as number;
  builder.limit(count + 1); // Request one extra to test if there are more results
  builder.offset(searchRequest.offset || 0);

  const rows = await builder.execute(client);
  const rowCount = rows.length;
  const resources = rows.slice(0, count).map((row) => JSON.parse(row.content as string)) as T[];
  const entries = resources.map(
    (resource) =>
      ({
        fullUrl: getFullUrl(resourceType, resource.id as string),
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

  return {
    entry: entries as BundleEntry<T>[],
    rowCount,
    hasMore: rows.length > count,
  };
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
    .filter((typedValue) => [PropertyType.canonical, PropertyType.uri].includes(typedValue.type))
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

export function getFullUrl(resourceType: string, id: string): string {
  return `${getConfig().baseUrl}fhir/R4/${resourceType}/${id}`;
}

function getSearchUrl(searchRequest: SearchRequest): string {
  return `${getConfig().baseUrl}fhir/R4/${searchRequest.resourceType}${formatSearchQuery(searchRequest)}`;
}

/**
 * Returns the total number of matching results for a search request.
 * This ignores page number and page size.
 * @param repo - The repository.
 * @param searchRequest - The search request.
 * @returns The total number of matching results.
 */
async function getAccurateCount(repo: Repository, searchRequest: SearchRequest): Promise<number> {
  const client = getClient();
  const builder = new SelectQuery(searchRequest.resourceType);
  repo.addDeletedFilter(builder);
  repo.addSecurityFilters(builder, searchRequest.resourceType);
  addSearchFilters(builder, searchRequest);

  if (builder.joins.length > 0) {
    builder.raw(`COUNT (DISTINCT "${searchRequest.resourceType}"."id")::int AS "count"`);
  } else {
    builder.raw('COUNT("id")::int AS "count"');
  }

  const rows = await builder.execute(client);
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
  const resourceType = searchRequest.resourceType;
  const client = getClient();
  const builder = new SelectQuery(resourceType).column('id');
  repo.addDeletedFilter(builder);
  repo.addSecurityFilters(builder, searchRequest.resourceType);
  addSearchFilters(builder, searchRequest);
  builder.explain = true;

  if (builder.joins.length > 0) {
    builder.groupBy({ tableName: resourceType, columnName: 'id' });
  }

  // See: https://wiki.postgresql.org/wiki/Count_estimate
  // This parses the query plan to find the estimated number of rows.
  const rows = await builder.execute(client);
  let result = 0;
  for (const row of rows) {
    const queryPlan = row['QUERY PLAN'];
    const match = /rows=(\d+)/.exec(queryPlan);
    if (match) {
      result = parseInt(match[1], 10);
      break;
    }
  }

  // Apply some logic to avoid obviously incorrect estimates
  const startIndex = (searchRequest.offset ?? 0) * (searchRequest.count ?? DEFAULT_SEARCH_COUNT);
  const minCount = rowCount === undefined ? startIndex : startIndex + rowCount;
  return Math.max(minCount, result);
}

/**
 * Adds all search filters as "WHERE" clauses to the query builder.
 * @param selectQuery - The select query builder.
 * @param searchRequest - The search request.
 */
function addSearchFilters(selectQuery: SelectQuery, searchRequest: SearchRequest): void {
  let expr;
  if(searchRequest.filters){
    expr = buildSearchFilterExpression(selectQuery, searchRequest.resourceType,searchRequest.resourceType,searchRequest.filters);
  }
  if (expr) {
    selectQuery.predicate.expressions.push(expr);
  }
}

// export function buildSearchExpression(selectQuery: SelectQuery, searchRequest: SearchRequest): Expression | undefined {
//   const expressions: Expression[] = [];
//   if (searchRequest.filters) {
//     for (const filter of searchRequest.filters) {
//       if (filter.code.startsWith('_has:') || filter.code.includes('.')) {
//         const chain = parseChainedParameter(searchRequest.resourceType, filter.code, filter.value);
//         buildChainedSearch(selectQuery, searchRequest.resourceType, chain);
//         continue;
//       }

//       const expr = buildSearchFilterExpression(
//         selectQuery,
//         searchRequest.resourceType,
//         searchRequest.resourceType,
//         filter
//       );
//       if (expr) {
//         expressions.push(expr);
//       }
//     }
//   }
//   if (expressions.length === 0) {
//     return undefined;
//   }
//   if (expressions.length === 1) {
//     return expressions[0];
//   }
//   return new Conjunction(expressions);
// }

/**
 * Builds a single search filter as "WHERE" clause to the query builder.
 * @param selectQuery - The select query builder.
 * @param resourceType - The type of resources requested.
 * @param table - The resource table.
 * @param filters - The search filter.
 * @returns The search query where expression
 */
// function buildSearchFilterExpression(
//   selectQuery: SearchQuery,
//   searchRequest
// )
export function buildSearchFilterExpression(
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  table: string,
  filters: Filter[],  
): Expression | undefined {
  const expressions: Expression[] = [];
  if (filters) {
    for (let filter of filters) {
      if (filter.code.startsWith('_has:') || filter.code.includes('.')) {
        const chain = parseChainedParameter(resourceType, filter.code, filter.value);
        buildChainedSearch(selectQuery, resourceType, chain);
        continue;
      }

      let expr;
      if (typeof filter.value !== 'string') {
        throw new OperationOutcomeError(badRequest('Search filter value must be a string'));
      }
    
      const specialParamExpression = trySpecialSearchParameter(selectQuery, resourceType, table, filter);
      if (specialParamExpression) {
        expr = specialParamExpression;
        expressions.push(expr)
        continue
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
        expr = lookupTable.buildWhere(selectQuery, resourceType, table, filter);
        if(expr){
          expressions.push(expr)
          continue
        }
      }
    
      // Not any special cases, just a normal search parameter.
      expr = buildNormalSearchFilterExpression(resourceType, table, param, filter);

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
 * Builds a search filter expression for a normal search parameter.
 *
 * Not any special cases, just a normal search parameter.
 * @param resourceType - The FHIR resource type.
 * @param table - The resource table.
 * @param param - The FHIR search parameter.
 * @param filter - The search filter.
 * @returns A SQL "WHERE" clause expression.
 */
function buildNormalSearchFilterExpression(
  resourceType: string,
  table: string,
  param: SearchParameter,
  filter: Filter
): Expression {
  const details = getSearchParameterDetails(resourceType, param);
  if (filter.operator === Operator.MISSING) {
    return new Condition(details.columnName, filter.value === 'true' ? '=' : '!=', null);
  } else if (param.type === 'string') {
    return buildStringSearchFilter(details, filter.operator, filter.value.split(','));
  } else if (param.type === 'token' || param.type === 'uri') {
    return buildTokenSearchFilter(table, details, filter.operator, filter.value.split(','));
  } else if (param.type === 'reference') {
    return buildReferenceSearchFilter(details, filter.value.split(','));
  } else if (param.type === 'date') {
    return buildDateSearchFilter(table, details, filter);
  } else if (param.type === 'quantity') {
    return new Condition(details.columnName, fhirOperatorToSqlOperator(filter.operator), filter.value);
  } else {
    const values = filter.value
      .split(',')
      .map((v) => new Condition(details.columnName, fhirOperatorToSqlOperator(filter.operator), v));
    const expr = new Disjunction(values);
    return details.array ? new ArraySubquery(new Column(undefined, details.columnName), expr) : expr;
  }
}

/**
 * Returns true if the search parameter code is a special search parameter.
 *
 * See: https://www.hl7.org/fhir/search.html#all
 * @param selectQuery - The select query builder.
 * @param resourceType - The type of resources requested.
 * @param table - The resource table.
 * @param filter - The search filter.
 * @returns True if the search parameter is a special code.
 */
function trySpecialSearchParameter(
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
        filter.value.split(',')
      );
    case '_lastUpdated':
      return buildDateSearchFilter(table, { type: SearchParameterType.DATETIME, columnName: 'lastUpdated' }, filter);
    case '_compartment':
    case '_project':
      return buildIdSearchFilter(
        table,
        { columnName: 'compartments', type: SearchParameterType.UUID, array: true },
        filter.operator,
        filter.value.split(',')
      );
    case '_filter':
      return buildFilterParameterExpression(selectQuery, resourceType, table, parseFilterParameter(filter.value));
    default:
      return undefined;
  }
}

function buildFilterParameterExpression(
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  table: string,
  filterExpression: FhirFilterExpression
): Expression {
  if (filterExpression instanceof FhirFilterNegation) {
    return new Negation(buildFilterParameterExpression(selectQuery, resourceType, table, filterExpression.child));
  } else if (filterExpression instanceof FhirFilterConnective) {
    return buildFilterParameterConnective(selectQuery, resourceType, table, filterExpression);
  } else if (filterExpression instanceof FhirFilterComparison) {
    return buildFilterParameterComparison(selectQuery, resourceType, table, filterExpression);
  } else {
    throw new OperationOutcomeError(badRequest('Unknown filter expression type'));
  }
}

function buildFilterParameterConnective(
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  table: string,
  filterConnective: FhirFilterConnective
): Expression {
  const expressions = [
    buildFilterParameterExpression(selectQuery, resourceType, table, filterConnective.left),
    buildFilterParameterExpression(selectQuery, resourceType, table, filterConnective.right),
  ];
  return filterConnective.keyword === 'and' ? new Conjunction(expressions) : new Disjunction(expressions);
}

function buildFilterParameterComparison(
  selectQuery: SelectQuery,
  resourceType: ResourceType,
  table: string,
  filterComparison: FhirFilterComparison
): Expression {
  return buildSearchFilterExpression(selectQuery, resourceType, table, [{
    code: filterComparison.path,
    operator: filterComparison.operator as Operator,
    value: filterComparison.value,
  }]) as Expression;
}

/**
 * Adds a string search filter as "WHERE" clause to the query builder.
 * @param details - The search parameter details.
 * @param operator - The search operator.
 * @param values - The string values to search against.
 * @returns The select query condition.
 */
function buildStringSearchFilter(details: SearchParameterDetails, operator: Operator, values: string[]): Expression {
  const conditions = values.map((v) => {
    if (operator === Operator.EXACT) {
      return new Condition(details.columnName, '=', v);
    } else if (operator === Operator.CONTAINS) {
      return new Condition(details.columnName, 'LIKE', `%${v}%`);
    } else {
      return new Condition(details.columnName, 'LIKE', `${v}%`);
    }
  });

  const expression = new Disjunction(conditions);
  if (details.array) {
    return new ArraySubquery(new Column(undefined, details.columnName), expression);
  }
  return expression;
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
 * @param details - The search parameter details.
 * @param values - The string values to search against.
 * @returns The select query condition.
 */
function buildReferenceSearchFilter(details: SearchParameterDetails, values: string[]): Expression {
  values = values.map((v) =>
    !v.includes('/') && (details.columnName === 'subject' || details.columnName === 'patient') ? `Patient/${v}` : v
  );
  if (details.array) {
    return new Condition(details.columnName, 'ARRAY_CONTAINS', values);
  } else if (values.length === 1) {
    return new Condition(details.columnName, '=', values[0]);
  }
  return new Condition(details.columnName, 'IN', values);
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
    return;
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

function buildChainedSearch(selectQuery: SelectQuery, resourceType: string, param: ChainedSearchParameter): void {
  if (param.chain.length > 3) {
    throw new OperationOutcomeError(badRequest('Search chains longer than three links are not currently supported'));
  }

  let currentResourceType = resourceType;
  let currentTable = resourceType;
  for (const link of param.chain) {
    const nextTable = selectQuery.getNextJoinAlias();
    const joinCondition = buildSearchLinkCondition(currentResourceType, link, currentTable, nextTable);
    selectQuery.innerJoin(link.resourceType, nextTable, joinCondition);

    if (link.filter) {
      const endCondition = buildSearchFilterExpression(
        selectQuery,
        link.resourceType as ResourceType,
        nextTable,
        [link.filter]
      );
      if (!endCondition) {
        throw new OperationOutcomeError(serverError(new Error(`Failed to build terminal filter for chained search`)));
      }
      selectQuery.whereExpr(endCondition);
    }

    currentTable = nextTable;
    currentResourceType = link.resourceType;
  }
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
      const searchParam = getSearchParameter(currentResourceType, part);
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
  return { resourceType, details };
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
  return { resourceType, details, reverse: true };
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
