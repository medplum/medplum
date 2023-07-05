import {
  badRequest,
  DEFAULT_SEARCH_COUNT,
  evalFhirPathTyped,
  FhirFilterComparison,
  FhirFilterConnective,
  FhirFilterExpression,
  FhirFilterNegation,
  Operator as FhirOperator,
  Filter,
  forbidden,
  formatSearchQuery,
  getReferenceString,
  getSearchParameterDetails,
  IncludeTarget,
  isResource,
  OperationOutcomeError,
  parseFilterParameter,
  PropertyType,
  SearchParameterDetails,
  SearchParameterType,
  SearchRequest,
  SortRule,
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
import { Column, Condition, Conjunction, Disjunction, Expression, Negation, Operator, SelectQuery } from './sql';
import { getSearchParameter } from './structure';

/**
 * Defines the maximum number of resources returned in a single search result.
 */
const maxSearchResults = 1000;

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
  let hasMore = false;
  if (searchRequest.count > 0) {
    ({ entry, hasMore } = await getSearchEntries<T>(repo, searchRequest));
  }

  let total = undefined;
  if (searchRequest.total === 'accurate') {
    total = await getAccurateCount(repo, searchRequest);
  } else if (searchRequest.total === 'estimate') {
    total = await getEstimateCount(repo, searchRequest);
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
 * @param repo The repository.
 * @param searchRequest The search request.
 * @returns The bundle entries for the search result.
 */
async function getSearchEntries<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest
): Promise<{ entry: BundleEntry<T>[]; hasMore: boolean }> {
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
  const resources = rows.slice(0, count).map((row) => JSON.parse(row.content as string)) as T[];
  const entries = resources.map(
    (resource) =>
      ({
        fullUrl: getFullUrl(resourceType, resource.id as string),
        resource,
      } as BundleEntry)
  );

  if (searchRequest.include || searchRequest.revInclude) {
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
        throw new Error(
          `Search with _(rev)include reached query scope limit: depth=${depth}, results=${entries.length}`
        );
      }

      const includes =
        searchRequest.include
          ?.filter((param) => !iterateOnly || param.modifier === FhirOperator.ITERATE)
          ?.map((param) => getSearchIncludeEntries(repo, param, base)) || [];
      const revincludes =
        searchRequest.revInclude
          ?.filter((param) => !iterateOnly || param.modifier === FhirOperator.ITERATE)
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

  for (const entry of entries) {
    repo.removeHiddenFields(entry.resource as Resource);
  }

  return {
    entry: entries as BundleEntry<T>[],
    hasMore: rows.length > count,
  };
}

/**
 * Returns bundle entries for the resources that are included in the search result.
 *
 * See documentation on _include: https://hl7.org/fhir/R4/search.html#include
 * @param repo The repository.
 * @param include The include parameter.
 * @param resources The base search result resources.
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
    .filter((typedValue) => (typedValue.type as PropertyType) === PropertyType.Reference)
    .map((typedValue) => typedValue.value as Reference);
  const readResult = await repo.readReferences(references);
  const includedResources = readResult.filter((e) => isResource(e as Resource | undefined)) as Resource[];

  const canonicalReferences = fhirPathResult
    .filter((typedValue) => [PropertyType.canonical, PropertyType.uri].includes(typedValue.type as PropertyType))
    .map((typedValue) => typedValue.value as string);
  if (canonicalReferences.length > 0) {
    const canonicalSearches = (searchParam.target || []).map((resourceType) =>
      // this.searchResources({
      getSearchEntries(repo, {
        resourceType: resourceType,
        filters: [
          {
            code: 'url',
            operator: FhirOperator.EQUALS,
            value: canonicalReferences.join(','),
          },
        ],
      })
    );
    (await Promise.all(canonicalSearches)).forEach((result) => {
      includedResources.push(...result.entry.map((e) => e.resource as Resource));
    });
  }

  return includedResources.map(
    (resource: Resource) =>
      ({
        fullUrl: getFullUrl(resource.resourceType, resource.id as string),
        resource,
      } as BundleEntry)
  ) as BundleEntry[];
}

/**
 * Returns bundle entries for the resources that are reverse included in the search result.
 *
 * See documentation on _revinclude: https://hl7.org/fhir/R4/search.html#revinclude
 * @param repo The repository.
 * @param revInclude The revInclude parameter.
 * @param resources The base search result resources.
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
          operator: FhirOperator.EQUALS,
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
 * @param searchRequest The search request.
 * @param hasMore True if there are more entries after the current page.
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
 * @param repo The repository.
 * @param searchRequest The search request.
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
 * @param repo The repository.
 * @param searchRequest The search request.
 * @returns The total number of matching results.
 */
async function getEstimateCount(repo: Repository, searchRequest: SearchRequest): Promise<number> {
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
 * Adds all search filters as "WHERE" clauses to the query builder.
 * @param selectQuery The select query builder.
 * @param searchRequest The search request.
 */
function addSearchFilters(selectQuery: SelectQuery, searchRequest: SearchRequest): void {
  const expr = buildSearchExpression(selectQuery, searchRequest);
  if (expr) {
    selectQuery.predicate.expressions.push(expr);
  }
}

export function buildSearchExpression(selectQuery: SelectQuery, searchRequest: SearchRequest): Expression | undefined {
  const expressions: Expression[] = [];
  if (searchRequest.filters) {
    for (const filter of searchRequest.filters) {
      const expr = buildSearchFilterExpression(selectQuery, searchRequest, filter);
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
 * @param selectQuery The select query builder.
 * @param searchRequest The search request.
 * @param filter The search filter.
 * @returns The search query where expression
 */
function buildSearchFilterExpression(
  selectQuery: SelectQuery,
  searchRequest: SearchRequest,
  filter: Filter
): Expression | undefined {
  if (typeof filter.value !== 'string') {
    throw new OperationOutcomeError(badRequest('Search filter value must be a string'));
  }

  const specialParamExpression = trySpecialSearchParameter(selectQuery, searchRequest, filter);
  if (specialParamExpression) {
    return specialParamExpression;
  }

  const resourceType = searchRequest.resourceType;
  let param = getSearchParameter(resourceType, filter.code);
  if (!param?.code) {
    throw new OperationOutcomeError(badRequest(`Unknown search parameter: ${filter.code}`));
  }

  if (filter.operator === FhirOperator.IDENTIFIER) {
    param = deriveIdentifierSearchParameter(param);
    filter = {
      ...filter,
      code: param.code as string,
      operator: FhirOperator.EQUALS,
    };
  }

  const lookupTable = getLookupTable(resourceType, param);
  if (lookupTable) {
    return lookupTable.buildWhere(selectQuery, resourceType, filter);
  }

  // Not any special cases, just a normal search parameter.
  return buildNormalSearchFilterExpression(resourceType, param, filter);
}

/**
 * Builds a search filter expression for a normal search parameter.
 *
 * Not any special cases, just a normal search parameter.
 * @param resourceType The FHIR resource type.
 * @param param The FHIR search parameter.
 * @param filter The search filter.
 * @returns A SQL "WHERE" clause expression.
 */
function buildNormalSearchFilterExpression(resourceType: string, param: SearchParameter, filter: Filter): Expression {
  const details = getSearchParameterDetails(resourceType, param);
  if (filter.operator === FhirOperator.MISSING) {
    return new Condition(details.columnName, filter.value === 'true' ? Operator.EQUALS : Operator.NOT_EQUALS, null);
  } else if (param.type === 'string') {
    return buildStringSearchFilter(details, filter);
  } else if (param.type === 'token' || param.type === 'uri') {
    return buildTokenSearchFilter(resourceType, details, filter);
  } else if (param.type === 'reference') {
    return buildReferenceSearchFilter(details, filter);
  } else if (param.type === 'date') {
    return buildDateSearchFilter(details, filter);
  } else if (param.type === 'quantity') {
    return new Condition(details.columnName, fhirOperatorToSqlOperator(filter.operator), parseFloat(filter.value));
  } else {
    return new Condition(details.columnName, fhirOperatorToSqlOperator(filter.operator), filter.value);
  }
}

/**
 * Returns true if the search parameter code is a special search parameter.
 *
 * See: https://www.hl7.org/fhir/search.html#all
 * @param selectQuery The select query builder.
 * @param searchRequest The overall search request.
 * @param filter The search filter.
 * @returns True if the search parameter is a special code.
 */
function trySpecialSearchParameter(
  selectQuery: SelectQuery,
  searchRequest: SearchRequest,
  filter: Filter
): Expression | undefined {
  const resourceType = searchRequest.resourceType;
  const code = filter.code;

  if (code === '_id') {
    return buildIdSearchFilter(resourceType, { columnName: 'id', type: SearchParameterType.UUID }, filter);
  }

  if (code === '_lastUpdated') {
    return buildDateSearchFilter({ type: SearchParameterType.DATETIME, columnName: 'lastUpdated' }, filter);
  }

  if (code === '_compartment' || code === '_project') {
    return buildIdSearchFilter(
      resourceType,
      { columnName: 'compartments', type: SearchParameterType.UUID, array: true },
      filter
    );
  }

  if (code === '_filter') {
    return buildFilterParameterExpression(selectQuery, searchRequest, parseFilterParameter(filter.value));
  }

  return undefined;
}

function buildFilterParameterExpression(
  selectQuery: SelectQuery,
  searchRequest: SearchRequest,
  filterExpression: FhirFilterExpression
): Expression {
  if (filterExpression instanceof FhirFilterNegation) {
    return buildFilterParameterNegation(selectQuery, searchRequest, filterExpression);
  } else if (filterExpression instanceof FhirFilterConnective) {
    return buildFilterParameterConnective(selectQuery, searchRequest, filterExpression);
  } else if (filterExpression instanceof FhirFilterComparison) {
    return buildFilterParameterComparison(selectQuery, searchRequest, filterExpression);
  } else {
    throw new OperationOutcomeError(badRequest('Unknown filter expression type'));
  }
}

function buildFilterParameterNegation(
  selectQuery: SelectQuery,
  searchRequest: SearchRequest,
  filterNegation: FhirFilterNegation
): Expression {
  return new Negation(buildFilterParameterExpression(selectQuery, searchRequest, filterNegation.child));
}

function buildFilterParameterConnective(
  selectQuery: SelectQuery,
  searchRequest: SearchRequest,
  filterConnective: FhirFilterConnective
): Expression {
  const expressions = [
    buildFilterParameterExpression(selectQuery, searchRequest, filterConnective.left),
    buildFilterParameterExpression(selectQuery, searchRequest, filterConnective.right),
  ];
  return filterConnective.keyword === 'and' ? new Conjunction(expressions) : new Disjunction(expressions);
}

function buildFilterParameterComparison(
  selectQuery: SelectQuery,
  searchRequest: SearchRequest,
  filterComparison: FhirFilterComparison
): Expression {
  return buildSearchFilterExpression(selectQuery, searchRequest, {
    code: filterComparison.path,
    operator: filterComparison.operator as FhirOperator,
    value: filterComparison.value,
  }) as Expression;
}

/**
 * Adds a string search filter as "WHERE" clause to the query builder.
 * @param details The search parameter details.
 * @param filter The search filter.
 * @returns The select query condition.
 */
function buildStringSearchFilter(details: SearchParameterDetails, filter: Filter): Expression {
  if (filter.operator === FhirOperator.EXACT) {
    return new Condition(details.columnName, Operator.EQUALS, filter.value);
  }
  return new Condition(details.columnName, Operator.LIKE, '%' + filter.value + '%');
}

/**
 * Adds an ID search filter as "WHERE" clause to the query builder.
 * @param resourceType The resource type.
 * @param details The search parameter details.
 * @param filter The search filter.
 * @returns The select query condition.
 */
function buildIdSearchFilter(resourceType: string, details: SearchParameterDetails, filter: Filter): Expression {
  const column = new Column(resourceType, details.columnName);
  const expressions = [];
  for (const valueStr of filter.value.split(',')) {
    let value: string | boolean = valueStr;
    if (valueStr.includes('/')) {
      value = valueStr.split('/').pop() as string;
    }
    if (!validator.isUUID(value)) {
      value = '00000000-0000-0000-0000-000000000000';
    }
    if (details.array) {
      expressions.push(new Condition(column, Operator.ARRAY_CONTAINS, value, details.type + '[]'));
    } else {
      expressions.push(new Condition(column, Operator.EQUALS, value));
    }
  }
  const disjunction = new Disjunction(expressions);
  if (filter.operator === FhirOperator.NOT_EQUALS || filter.operator === FhirOperator.NOT) {
    return new Negation(disjunction);
  }
  return disjunction;
}

/**
 * Adds a token search filter as "WHERE" clause to the query builder.
 * @param resourceType The resource type.
 * @param details The search parameter details.
 * @param filter The search filter.
 * @returns The select query condition.
 */
function buildTokenSearchFilter(resourceType: string, details: SearchParameterDetails, filter: Filter): Expression {
  const column = new Column(resourceType, details.columnName);
  const expressions = [];
  for (const valueStr of filter.value.split(',')) {
    let value: string | boolean = valueStr;
    if (details.type === SearchParameterType.BOOLEAN) {
      value = valueStr === 'true';
    } else if (valueStr.includes('|')) {
      value = valueStr.split('|').pop() as string;
    }
    if (details.array) {
      expressions.push(new Condition(column, Operator.ARRAY_CONTAINS, value, details.type + '[]'));
    } else if (filter.operator === FhirOperator.CONTAINS) {
      expressions.push(new Condition(column, Operator.LIKE, '%' + value + '%'));
    } else {
      expressions.push(new Condition(column, Operator.EQUALS, value));
    }
  }
  const disjunction = new Disjunction(expressions);
  if (filter.operator === FhirOperator.NOT_EQUALS || filter.operator === FhirOperator.NOT) {
    return new Negation(disjunction);
  }
  return disjunction;
}

/**
 * Adds a reference search filter as "WHERE" clause to the query builder.
 * @param details The search parameter details.
 * @param filter The search filter.
 * @returns The select query condition.
 */
function buildReferenceSearchFilter(details: SearchParameterDetails, filter: Filter): Expression {
  const values = [];
  for (const value of filter.value.split(',')) {
    if (!value.includes('/') && (details.columnName === 'subject' || details.columnName === 'patient')) {
      values.push('Patient/' + value);
    } else {
      values.push(value);
    }
  }
  if (details.array) {
    return new Condition(details.columnName, Operator.ARRAY_CONTAINS, values);
  }
  if (values.length === 1) {
    return new Condition(details.columnName, Operator.EQUALS, values[0]);
  }
  return new Condition(details.columnName, Operator.IN, values);
}

/**
 * Adds a date or date/time search filter.
 * @param details The search parameter details.
 * @param filter The search filter.
 * @returns The select query condition.
 */
function buildDateSearchFilter(details: SearchParameterDetails, filter: Filter): Expression {
  const dateValue = new Date(filter.value);
  if (isNaN(dateValue.getTime())) {
    throw new OperationOutcomeError(badRequest(`Invalid date value: ${filter.value}`));
  }
  return new Condition(details.columnName, fhirOperatorToSqlOperator(filter.operator), filter.value);
}

/**
 * Adds all "order by" clauses to the query builder.
 * @param builder The client query builder.
 * @param searchRequest The search request.
 */
function addSortRules(builder: SelectQuery, searchRequest: SearchRequest): void {
  searchRequest.sortRules?.forEach((sortRule) => addOrderByClause(builder, searchRequest, sortRule));
}

/**
 * Adds a single "order by" clause to the query builder.
 * @param builder The client query builder.
 * @param searchRequest The search request.
 * @param sortRule The sort rule.
 */
function addOrderByClause(builder: SelectQuery, searchRequest: SearchRequest, sortRule: SortRule): void {
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
 * @param fhirOperator The FHIR operator.
 * @returns The equivalent SQL operator.
 */
function fhirOperatorToSqlOperator(fhirOperator: FhirOperator): Operator {
  switch (fhirOperator) {
    case FhirOperator.EQUALS:
      return Operator.EQUALS;
    case FhirOperator.NOT:
    case FhirOperator.NOT_EQUALS:
      return Operator.NOT_EQUALS;
    case FhirOperator.GREATER_THAN:
    case FhirOperator.STARTS_AFTER:
      return Operator.GREATER_THAN;
    case FhirOperator.GREATER_THAN_OR_EQUALS:
      return Operator.GREATER_THAN_OR_EQUALS;
    case FhirOperator.LESS_THAN:
    case FhirOperator.ENDS_BEFORE:
      return Operator.LESS_THAN;
    case FhirOperator.LESS_THAN_OR_EQUALS:
      return Operator.LESS_THAN_OR_EQUALS;
    default:
      throw new Error(`Unknown FHIR operator: ${fhirOperator}`);
  }
}
