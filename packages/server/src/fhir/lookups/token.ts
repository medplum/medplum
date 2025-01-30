import {
  badRequest,
  Operator as FhirOperator,
  Filter,
  getSearchParameters,
  OperationOutcomeError,
  SortRule,
  splitN,
  splitSearchOnComma,
} from '@medplum/core';
import { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { PoolClient } from 'pg';
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
import { buildTokensForSearchParameter, getTokenIndexType, isCaseSensitiveSearchParameter, Token } from '../tokens';
import { LookupTable } from './lookuptable';
import { deriveIdentifierSearchParameter } from './util';

export const ReadFromTokenColumns = {
  value: false,
};

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
    return Boolean(getTokenIndexType(searchParam, resourceType));
  }

  /**
   * Indexes a resource token values.
   * Attempts to reuse existing tokens if they are correct.
   * @param client - The database client.
   * @param resource - The resource to index.
   * @param create - True if the resource should be created (vs updated).
   * @returns Promise on completion.
   */
  async indexResource(client: PoolClient, resource: Resource, create: boolean): Promise<void> {
    if (!create) {
      await this.deleteValuesForResource(client, resource);
    }

    const tokens = getTokens(resource);
    const resourceType = resource.resourceType;
    const resourceId = resource.id as string;
    const values = tokens.map((token) => ({
      resourceId,
      code: token.code,
      // logical OR coalesce to ensure that empty strings are inserted as NULL
      system: token.system?.trim?.() || undefined,
      value: token.value?.trim?.() || undefined,
    }));

    await this.insertValuesForResource(client, resourceType, values);
  }

  /**
   * Builds a "where" condition for the select query builder.
   * @param _selectQuery - The select query builder.
   * @param resourceType - The resource type.
   * @param table - The resource table.
   * @param param - The search parameter.
   * @param filter - The search filter details.
   * @returns The select query where expression.
   */
  buildWhere(
    _selectQuery: SelectQuery,
    resourceType: ResourceType,
    table: string,
    param: SearchParameter,
    filter: Filter
  ): Expression {
    const lookupTableName = this.getTableName(resourceType);

    const conjunction = new Conjunction([
      new Condition(new Column(table, 'id'), '=', new Column(lookupTableName, 'resourceId')),
      new Condition(new Column(lookupTableName, 'code'), '=', filter.code),
    ]);

    const caseSensitive = isCaseSensitiveSearchParameter(param, resourceType);

    const whereExpression = buildWhereExpression(lookupTableName, caseSensitive, filter);
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
export function shouldCompareTokenValue(operator: FhirOperator): boolean {
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
  } else if (filter.operator === FhirOperator.MISSING) {
    // Missing = true means that there should not be a row
    switch (filter.value.toLowerCase()) {
      case 'true':
        return false;
      case 'false':
        return true;
      default:
        throw new OperationOutcomeError(badRequest("Search filter ':missing' must have a value of 'true' or 'false'"));
    }
  } else if (filter.operator === FhirOperator.PRESENT) {
    // Present = true means that there should be a row
    switch (filter.value.toLowerCase()) {
      case 'true':
        return true;
      case 'false':
        return false;
      default:
        throw new OperationOutcomeError(badRequest("Search filter ':missing' must have a value of 'true' or 'false'"));
    }
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
 * @param resource - The resource being indexed.
 * @returns An array of all tokens from the resource to be inserted into the database.
 */
function getTokens(resource: Resource): Token[] {
  const searchParams = getSearchParameters(resource.resourceType);
  const result: Token[] = [];
  if (searchParams) {
    for (const searchParam of Object.values(searchParams)) {
      if (getTokenIndexType(searchParam, resource.resourceType)) {
        buildTokensForSearchParameter(result, resource, searchParam);
      }
      if (searchParam.type === 'reference') {
        buildTokensForSearchParameter(result, resource, deriveIdentifierSearchParameter(searchParam));
      }
    }
  }
  return result;
}

/**
 *
 * Returns a Disjunction of filters on the token table based on `filter.operator`, or `undefined` if no filters are required.
 * The Disjunction will contain one filter for each specified query value.
 *
 * @param tableName - The token table name
 * @param caseSensitive - If the query value should be case sensitive.
 * @param filter - The SearchRequest filter being performed on the token
 * @returns A Disjunction of filters on the token table based on `filter.operator`, or `undefined` if no filters are
 * required.
 */
function buildWhereExpression(tableName: string, caseSensitive: boolean, filter: Filter): Expression | undefined {
  const subExpressions = [];
  for (const option of splitSearchOnComma(filter.value)) {
    const expression = buildWhereCondition(tableName, filter.operator, caseSensitive, option);
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
 * @param tableName - The token table name
 * @param operator - The SearchRequest operator being performed on the token
 * @param caseSensitive - If the query value should be case sensitive.
 * @param query - The query value of the operator
 * @returns A WHERE Condition on the token table, if applicable, else undefined
 */
function buildWhereCondition(
  tableName: string,
  operator: FhirOperator,
  caseSensitive: boolean,
  query: string
): Expression | undefined {
  const parts = splitN(query, '|', 2);
  // Handle the case where the query value is a system|value pair (e.g. token or identifier search)
  if (parts.length === 2) {
    const system = parts[0] || null; // Logical OR coalesce to account for system being the empty string, i.e. [parameter]=|[code]
    const value = parts[1];
    const systemCondition = new Condition(new Column(tableName, 'system'), '=', system);
    return value
      ? new Conjunction([systemCondition, buildValueCondition(tableName, operator, caseSensitive, value)])
      : systemCondition;
  } else {
    // If using the :in operator, build the condition for joining to the ValueSet table specified by `query`
    if (operator === FhirOperator.IN) {
      return buildInValueSetCondition(tableName, query);
    } else if (operator === FhirOperator.NOT_IN) {
      return new Negation(buildInValueSetCondition(tableName, query));
    }
    // If we we are searching for a particular token value, build a Condition that filters the lookup table on that
    //value
    if (shouldCompareTokenValue(operator)) {
      return buildValueCondition(tableName, operator, caseSensitive, query);
    }
    // Otherwise we are just looking for the presence / absence of a token (e.g. when using the FhirOperator.MISSING)
    // so we don't need to construct a filter Condition on the token table.
    return undefined;
  }
}

function buildValueCondition(
  tableName: string,
  operator: FhirOperator,
  caseSensitive: boolean,
  value: string
): Expression {
  const column = new Column(tableName, 'value');
  value = value.trim();

  if (operator === FhirOperator.TEXT) {
    getLogger().warn('Potentially expensive token lookup query', { operator });
    return new Conjunction([
      new Condition(new Column(tableName, 'system'), '=', 'text'),
      new Condition(column, 'TSVECTOR_SIMPLE', value + ':*'),
    ]);
  } else if (operator === FhirOperator.CONTAINS) {
    getLogger().warn('Potentially expensive token lookup query', { operator });
    return new Condition(column, 'LIKE', escapeLikeString(value) + '%');
  } else if (caseSensitive) {
    return new Condition(column, '=', value);
  } else {
    // In Medplum v4, or when there is a guarantee all resources have been reindexed, the IN (...) can be
    // switched to an '=' of just the lower-cased value for a simplified query and potentially better performance.
    return new Condition(column, 'IN', [value, value.toLocaleLowerCase()]);
  }
}

/**
 * Builds "where" condition for token ":in" operator.
 * @param tableName - The token table name / join alias.
 * @param value - The value of the ":in" operator.
 * @returns The "where" condition.
 */
function buildInValueSetCondition(tableName: string, value: string): Condition {
  // This is complicated
  //
  // Here is an example FHIR expression:
  //
  //    Condition?code:in=http://hl7.org/fhir/ValueSet/condition-code
  //
  // The ValueSet URL is a reference to a ValueSet resource.
  // The ValueSet resource contains a list of systems and/or codes.
  //
  // Consider these "ValueSet" table columns:
  //
  //          Column        |           Type           | Collation | Nullable | Default
  //   ---------------------+--------------------------+-----------+----------+---------
  //    id                  | uuid                     |           | not null |
  //    url                 | text                     |           |          |
  //    reference           | text[]                   |           |          |
  //
  // Consider these "Condition_Token" table columns:
  //
  //      Column   |  Type   | Collation | Nullable | Default
  //   ------------+---------+-----------+----------+---------
  //    resourceId | uuid    |           | not null |
  //    code       | text    |           | not null |
  //    system     | text    |           |          |
  //    value      | text    |           |          |
  //
  // In plain english:
  //
  //   We want the Condition resources
  //   with a fixed "code" column value (referring to the "code" column in the "Condition_Token" table)
  //   where the "system" column value is in the "reference" column of the "ValueSet" table
  //
  // Now imagine the query for just "Condition_Token" and "ValueSet":
  //
  //  SELECT "Condition_Token"."resourceId"
  //  FROM "Condition_Token"
  //  WHERE "Condition_Token"."code"='code'
  //  AND "Condition_Token"."system"=ANY(
  //    (
  //       SELECT "ValueSet"."reference"
  //       FROM "ValueSet"
  //       WHERE "ValueSet"."url"='http://hl7.org/fhir/ValueSet/condition-code'
  //       LIMIT 1
  //    )::TEXT[]
  //  )
  //
  // Now we need to add the query for "Condition" and "Condition_Token" and "ValueSet":
  //
  //   SELECT "Condition"."id"
  //   FROM "Condition"
  //   LEFT JOIN "Condition_Token" ON (
  //     "Condition_Token"."resourceId"="Condition"."id"
  //     AND
  //     "Condition_Token"."code"='code'
  //     AND
  //     "Condition_Token"."system"=ANY(
  //       (
  //         SELECT "ValueSet"."reference"
  //         FROM "ValueSet"
  //         WHERE "ValueSet"."url"='http://hl7.org/fhir/ValueSet/condition-code'
  //         LIMIT 1
  //       )::TEXT[]
  //     )
  //   )
  //
  return new Condition(
    new Column(tableName, 'system'),
    'IN_SUBQUERY',
    new SelectQuery('ValueSet').column('reference').where('url', '=', value).limit(1),
    'TEXT[]'
  );
}
