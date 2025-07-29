import {
  badRequest,
  Operator as FhirOperator,
  Filter,
  OperationOutcomeError,
  SortRule,
  splitN,
  splitSearchOnComma,
  WithId,
} from '@medplum/core';
import { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { getLogger } from '../../logger';
import {
  Column,
  Condition,
  Conjunction,
  Disjunction,
  escapeLikeString,
  Expression,
  Negation,
  SelectQuery,
  SqlFunction,
} from '../sql';
import {
  buildTokensForSearchParameter,
  getTokenIndexType,
  shouldTokenExistForMissingOrPresent,
  Token,
  TokenIndexTypes,
} from '../tokens';
import { LookupTable, LookupTableRow } from './lookuptable';
import { getStandardAndDerivedSearchParameters } from './util';

export interface TokenTableRow extends LookupTableRow {
  code: string;
  system: string | undefined;
  value: string | undefined;
}

/** Context for building a WHERE condition on the token table. */
interface FilterContext {
  searchParam: SearchParameter;
  lookupTableName: string;
  caseInsensitive: boolean;
  filter: Filter;
}

/**
 * The TokenTable class is used to index and search "token" properties.
 * This can include "Identifier", "CodeableConcept", "Coding", and a number of string properties.
 * The common case for tokens is a "system" and "value" key/value pair.
 * Each token is represented as a separate row in the "Token" table.
 */
export class TokenTable extends LookupTable {
  /**
   * Returns the table name.
   * @param resourceType - The resource type.
   * @returns The table name.
   */
  getTableName(resourceType: ResourceType): string {
    return getTableName(resourceType);
  }

  /**
   * Returns the column name for the value.
   * @returns The column name.
   */
  getColumnName(): string {
    return 'value';
  }

  /**
   * Returns true if the search parameter is an "token" parameter.
   * @param searchParam - The search parameter.
   * @param resourceType - The resource type.
   * @returns True if the search parameter is an "token" parameter.
   */
  isIndexed(searchParam: SearchParameter, resourceType: string): boolean {
    return TokenTable.isIndexed(searchParam, resourceType);
  }

  static isIndexed(searchParam: SearchParameter, resourceType: string): boolean {
    return getTokenIndexType(searchParam, resourceType) !== undefined;
  }

  isCaseInsensitive(searchParam: SearchParameter, resourceType: string): boolean {
    const tokenType = getTokenIndexType(searchParam, resourceType);
    return tokenType === TokenIndexTypes.CASE_INSENSITIVE;
  }

  extractValues(results: TokenTableRow[], resource: WithId<Resource>): void {
    const tokens: Token[] = [];
    getTokens(tokens, resource);
    for (const token of tokens) {
      results.push({
        resourceId: resource.id,
        code: token.code,
        // logical OR coalesce to ensure that empty strings are inserted as NULL
        system: token.system?.trim?.() || undefined,
        value: token.value?.trim?.() || undefined,
      });
    }
  }

  /**
   * Builds a "where" condition for the select query builder.
   * @param _selectQuery - The select query builder.
   * @param resourceType - The resource type.
   * @param resourceTableName - The resource table.
   * @param param - The search parameter.
   * @param filter - The search filter details.
   * @returns The select query where expression.
   */
  buildWhere(
    _selectQuery: SelectQuery,
    resourceType: ResourceType,
    resourceTableName: string,
    param: SearchParameter,
    filter: Filter
  ): Expression {
    const lookupTableName = this.getTableName(resourceType);

    const conjunction = new Conjunction([
      new Condition(new Column(resourceTableName, 'id'), '=', new Column(lookupTableName, 'resourceId')),
      new Condition(new Column(lookupTableName, 'code'), '=', filter.code),
    ]);

    const caseInsensitive = this.isCaseInsensitive(param, resourceType);

    if (filter.operator === FhirOperator.IN || filter.operator === FhirOperator.NOT_IN) {
      throw new OperationOutcomeError(
        badRequest(`Search filter '${filter.operator}' not supported for ${param.id ?? param.code}`)
      );
    }

    const whereExpression = buildWhereExpression({ searchParam: param, lookupTableName, caseInsensitive, filter });
    if (whereExpression) {
      conjunction.expressions.push(whereExpression);
    }

    const exists = new SqlFunction('EXISTS', [new SelectQuery(lookupTableName).whereExpr(conjunction)]);

    if (shouldTokenRowExist(filter)) {
      return exists;
    } else {
      return new Negation(exists);
    }
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery - The select query builder.
   * @param resourceType - The resource type.
   * @param sortRule - The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, resourceType: ResourceType, sortRule: SortRule): void {
    const lookupTableName = this.getTableName(resourceType);
    const joinName = selectQuery.getNextJoinAlias();
    const joinOnExpression = new Condition(new Column(resourceType, 'id'), '=', new Column(joinName, 'resourceId'));
    selectQuery.join(
      'INNER JOIN',
      new SelectQuery(lookupTableName)
        .distinctOn('resourceId')
        .column('resourceId')
        .column('value')
        .whereExpr(new Condition(new Column(lookupTableName, 'code'), '=', sortRule.code)),
      joinName,
      joinOnExpression
    );
    selectQuery.orderBy(new Column(joinName, 'value'), sortRule.descending);
  }
}

/**
 * Returns true if the filter value should be compared to the "value" column.
 * Used to construct the join ON conditions
 * @param operator - Filter operator applied to the token field
 * @returns True if the filter value should be compared to the "value" column.
 */
function shouldCompareTokenValue(operator: FhirOperator): boolean {
  switch (operator) {
    case FhirOperator.MISSING:
    case FhirOperator.PRESENT:
    case FhirOperator.IN:
    case FhirOperator.NOT_IN:
    case FhirOperator.IDENTIFIER:
      return false;
    default:
      return true;
  }
}

/**
 * Returns true if the filter requires a token row to exist AFTER the join has been performed
 * @param filter - Filter applied to the token field
 * @returns True if the filter requires a token row to exist AFTER the join has been performed
 */
export function shouldTokenRowExist(filter: Filter): boolean {
  if (shouldCompareTokenValue(filter.operator)) {
    // If the filter is "not equals", then we're looking for ID=null
    // If the filter is "equals", then we're looking for ID!=null
    if (filter.operator === FhirOperator.NOT || filter.operator === FhirOperator.NOT_EQUALS) {
      return false;
    }
  } else if (filter.operator === FhirOperator.MISSING || filter.operator === FhirOperator.PRESENT) {
    return shouldTokenExistForMissingOrPresent(filter.operator, filter.value);
  }
  return true;
}

/**
 * Returns the token table name for the resource type.
 * @param resourceType - The FHIR resource type.
 * @returns The database table name for the resource type tokens.
 */
function getTableName(resourceType: ResourceType): string {
  return resourceType + '_Token';
}

/**
 * Returns a list of all tokens in the resource to be inserted into the database.
 * This includes all values for any SearchParameter using the TokenTable.
 * @param result - The array that rows to be inserted should be added to.
 * @param resource - The resource being indexed.
 */
function getTokens(result: Token[], resource: Resource): void {
  for (const searchParam of getStandardAndDerivedSearchParameters(resource.resourceType)) {
    if (getTokenIndexType(searchParam, resource.resourceType)) {
      buildTokensForSearchParameter(result, resource, searchParam);
    }
  }
}

/**
 *
 * Returns a Disjunction of filters on the token table based on `filter.operator`, or `undefined` if no filters are required.
 * The Disjunction will contain one filter for each specified query value.
 *
 * @param context - The context of the filter being performed.
 * @returns A Disjunction of filters on the token table based on `filter.operator`, or `undefined` if no filters are
 * required.
 */
function buildWhereExpression(context: FilterContext): Expression | undefined {
  const subExpressions = [];
  for (const option of splitSearchOnComma(context.filter.value)) {
    const expression = buildWhereCondition(context, option);
    if (expression) {
      subExpressions.push(expression);
    }
  }
  if (subExpressions.length > 0) {
    return new Disjunction(subExpressions);
  }
  // filter.operator does not require any WHERE Conditions on the token table (e.g. FhirOperator.MISSING)
  return undefined;
}

/**
 *
 * Returns a WHERE Condition for a specific search query value, if applicable based on the `operator`
 *
 * @param context - The context of the filter being performed.
 * @param query - The query value of the operator
 * @returns A WHERE Condition on the token table, if applicable, else undefined
 */
function buildWhereCondition(context: FilterContext, query: string): Expression | undefined {
  const operator = context.filter.operator;
  const parts = splitN(query, '|', 2);
  // Handle the case where the query value is a system|value pair (e.g. token or identifier search)
  if (parts.length === 2) {
    const system = parts[0] || null; // Logical OR coalesce to account for system being the empty string, i.e. [parameter]=|[code]
    const value = parts[1];
    const systemCondition = new Condition(new Column(context.lookupTableName, 'system'), '=', system);
    return value ? new Conjunction([systemCondition, buildValueCondition(context, value)]) : systemCondition;
  } else {
    // If we we are searching for a particular token value, build a Condition that filters the lookup table on that
    //value
    if (shouldCompareTokenValue(operator)) {
      return buildValueCondition(context, query);
    }
    // Otherwise we are just looking for the presence / absence of a token (e.g. when using the FhirOperator.MISSING)
    // so we don't need to construct a filter Condition on the token table.
    return undefined;
  }
}

function buildValueCondition(context: FilterContext, value: string): Expression {
  const { lookupTableName: tableName, caseInsensitive } = context;
  const operator = context.filter.operator;
  const column = new Column(tableName, 'value');
  value = value.trim();

  if (operator === FhirOperator.TEXT) {
    logExpensiveQuery(context, value);
    return new Conjunction([
      new Condition(new Column(tableName, 'system'), '=', 'text'),
      new Condition(column, 'TSVECTOR_SIMPLE', value + ':*'),
    ]);
  } else if (operator === FhirOperator.CONTAINS) {
    logExpensiveQuery(context, value);
    return new Condition(column, 'LIKE', escapeLikeString(value) + '%');
  } else {
    if (value && caseInsensitive) {
      value = value.toLocaleLowerCase();
    }
    return new Condition(column, '=', value);
  }
}

function logExpensiveQuery(context: FilterContext, value: string): void {
  getLogger().warn('Potentially expensive token lookup query', {
    operator: context.filter.operator,
    searchParameter: { id: context.searchParam.id, code: context.searchParam.code },
    filterValue: context.filter.value,
    value,
  });
}
