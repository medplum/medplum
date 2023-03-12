import {
  evalFhirPathTyped,
  Filter,
  getSearchParameterDetails,
  Operator as FhirOperator,
  PropertyType,
  SortRule,
  toTypedValue,
  TypedValue,
} from '@medplum/core';
import {
  CodeableConcept,
  Coding,
  ContactPoint,
  Identifier,
  Resource,
  ResourceType,
  SearchParameter,
} from '@medplum/fhirtypes';
import { PoolClient } from 'pg';
import { Column, Condition, Conjunction, Disjunction, Expression, Operator, SelectQuery } from '../sql';
import { getSearchParameters } from '../structure';
import { LookupTable } from './lookuptable';
import { compareArrays, deriveIdentifierSearchParameter } from './util';

interface Token {
  readonly code: string;
  readonly system: string | undefined;
  readonly value: string | undefined;
}

/**
 * The TokenTable class is used to index and search "token" properties.
 * This can include "Identifier", "CodeableConcept", "Coding", and a number of string properties.
 * The common case for tokens is a "system" and "value" key/value pair.
 * Each token is represented as a separate row in the "Token" table.
 */
export class TokenTable extends LookupTable<Token> {
  /**
   * Returns the table name.
   * @param resourceType The resource type.
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
   * @param searchParam The search parameter.
   * @param resourceType The resource type.
   * @returns True if the search parameter is an "token" parameter.
   */
  isIndexed(searchParam: SearchParameter, resourceType: string): boolean {
    return isIndexed(searchParam, resourceType);
  }

  /**
   * Indexes a resource token values.
   * Attempts to reuse existing tokens if they are correct.
   * @param client The database client.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(client: PoolClient, resource: Resource): Promise<void> {
    const tokens = getTokens(resource);
    const resourceType = resource.resourceType;
    const resourceId = resource.id as string;
    const existing = await getExistingValues(client, resourceType, resourceId);

    if (!compareArrays(tokens, existing)) {
      if (existing.length > 0) {
        await this.deleteValuesForResource(client, resource);
      }

      const values = [];

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        values.push({
          resourceId,
          code: token.code,
          index: i,
          system: token.system?.trim(),
          value: token.value?.trim(),
        });
      }

      await this.insertValuesForResource(client, resourceType, values);
    }
  }

  /**
   * Builds a "where" condition for the select query builder.
   * @param selectQuery The select query builder.
   * @param resourceType The resource type.
   * @param filter The search filter details.
   */
  buildWhere(selectQuery: SelectQuery, resourceType: ResourceType, filter: Filter): Expression {
    const tableName = getTableName(resourceType);
    const joinName = selectQuery.getNextJoinAlias();
    const subQuery = new SelectQuery(tableName)
      .raw(`DISTINCT ON ("${tableName}"."resourceId") *`)
      .where('code', Operator.EQUALS, filter.code)
      .orderBy('resourceId');
    subQuery.whereExpr(buildWhereExpression(selectQuery, subQuery, tableName, filter));
    selectQuery.join(joinName, 'id', 'resourceId', subQuery);

    // If the filter is "not equals", then we're looking for ID=null
    // If the filter is "equals", then we're looking for ID!=null
    const sqlOperator =
      filter.operator === FhirOperator.NOT || filter.operator === FhirOperator.NOT_EQUALS
        ? Operator.EQUALS
        : Operator.NOT_EQUALS;
    return new Condition(new Column(joinName, 'resourceId'), sqlOperator, null);
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery The select query builder.
   * @param resourceType The resource type.
   * @param sortRule The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, resourceType: ResourceType, sortRule: SortRule): void {
    const tableName = getTableName(resourceType);
    const joinName = selectQuery.getNextJoinAlias();
    const subQuery = new SelectQuery(tableName)
      .raw(`DISTINCT ON ("${tableName}"."resourceId") *`)
      .where('code', Operator.EQUALS, sortRule.code)
      .orderBy('resourceId');
    selectQuery.join(joinName, 'id', 'resourceId', subQuery);
    selectQuery.orderBy(new Column(joinName, 'value'), sortRule.descending);
  }
}

/**
 * Returns true if the search parameter is an "token" parameter.
 * @param searchParam The search parameter.
 * @param resourceType The resource type.
 * @returns True if the search parameter is an "token" parameter.
 */
function isIndexed(searchParam: SearchParameter, resourceType: string): boolean {
  if (searchParam.type !== 'token') {
    return false;
  }

  const details = getSearchParameterDetails(resourceType, searchParam);
  const elementDefinition = details.elementDefinition;
  if (!elementDefinition?.type) {
    return false;
  }

  // Check for any "Identifier", "CodeableConcept", or "Coding"
  // Any of those value types require the "Token" table for full system|value search semantics.
  // The common case is that the "type" property only has one value,
  // but we need to support arrays of types for the choice-of-type properties such as "value[x]".
  for (const type of elementDefinition.type) {
    if (
      type.code === PropertyType.Identifier ||
      type.code === PropertyType.CodeableConcept ||
      type.code === PropertyType.Coding ||
      type.code === PropertyType.ContactPoint
    ) {
      return true;
    }
  }

  // This is a "token" search parameter, but it is only "code", "string", or "boolean"
  // So we can use a simple column on the resource type table.
  return false;
}

/**
 * Returns the token table name for the resource type.
 * @param resourceType The FHIR resource type.
 * @returns The database table name for the resource type tokens.
 */
function getTableName(resourceType: ResourceType): string {
  return resourceType + '_Token';
}

/**
 * Returns a list of all tokens in the resource to be inserted into the database.
 * This includes all values for any SearchParameter using the TokenTable.
 * @param resource The resource being indexed.
 * @returns An array of all tokens from the resource to be inserted into the database.
 */
function getTokens(resource: Resource): Token[] {
  const typedResource = [toTypedValue(resource)];
  const searchParams = getSearchParameters(resource.resourceType);
  const result: Token[] = [];
  if (searchParams) {
    for (const searchParam of Object.values(searchParams)) {
      if (isIndexed(searchParam, resource.resourceType)) {
        buildTokensForSearchParameter(result, typedResource, searchParam);
      }
      if (searchParam.type === 'reference') {
        buildTokensForSearchParameter(result, typedResource, deriveIdentifierSearchParameter(searchParam));
      }
    }
  }
  return result;
}

/**
 * Builds a list of zero or more tokens for a search parameter and resource.
 * @param result The result array where tokens will be added.
 * @param typedResource The typed resource.
 * @param searchParam The search parameter.
 */
function buildTokensForSearchParameter(
  result: Token[],
  typedResource: TypedValue[],
  searchParam: SearchParameter
): void {
  const typedValues = evalFhirPathTyped(searchParam.expression as string, typedResource);
  for (const typedValue of typedValues) {
    buildTokens(result, searchParam, typedValue);
  }
}

/**
 * Builds a list of zero or more tokens for a search parameter and value.
 * @param result The result array where tokens will be added.
 * @param searchParam The search parameter.
 * @param typedValue A typed value to be indexed for the search parameter.
 */
function buildTokens(result: Token[], searchParam: SearchParameter, typedValue: TypedValue): void {
  const { type, value } = typedValue;
  if (type === PropertyType.Identifier) {
    buildIdentifierToken(result, searchParam, value as Identifier);
  } else if (type === PropertyType.CodeableConcept) {
    buildCodeableConceptToken(result, searchParam, value as CodeableConcept);
  } else if (type === PropertyType.Coding) {
    buildCodingToken(result, searchParam, value as Coding);
  } else if (type === PropertyType.ContactPoint) {
    buildContactPointToken(result, searchParam, value as ContactPoint);
  } else {
    buildSimpleToken(result, searchParam, undefined, value?.toString() as string | undefined);
  }
}

/**
 * Builds an identifier token.
 * @param result The result array where tokens will be added.
 * @param searchParam The search parameter.
 * @param identifier The Identifier object to be indexed.
 */
function buildIdentifierToken(result: Token[], searchParam: SearchParameter, identifier: Identifier | undefined): void {
  buildSimpleToken(result, searchParam, identifier?.system, identifier?.value);
}

/**
 * Builds zero or more CodeableConcept tokens.
 * @param result The result array where tokens will be added.
 * @param searchParam The search parameter.
 * @param codeableConcept The CodeableConcept object to be indexed.
 */
function buildCodeableConceptToken(
  result: Token[],
  searchParam: SearchParameter,
  codeableConcept: CodeableConcept | undefined
): void {
  if (codeableConcept?.text) {
    buildSimpleToken(result, searchParam, 'text', codeableConcept.text);
  }
  if (codeableConcept?.coding) {
    for (const coding of codeableConcept.coding) {
      buildCodingToken(result, searchParam, coding);
    }
  }
}

/**
 * Builds a Coding token.
 * @param result The result array where tokens will be added.
 * @param searchParam The search parameter.
 * @param coding The Coding object to be indexed.
 */
function buildCodingToken(result: Token[], searchParam: SearchParameter, coding: Coding | undefined): void {
  if (coding) {
    if (coding.display) {
      buildSimpleToken(result, searchParam, 'text', coding.display);
    }
    buildSimpleToken(result, searchParam, coding.system, coding.code);
  }
}

/**
 * Builds a ContactPoint token.
 * @param result The result array where tokens will be added.
 * @param searchParam The search parameter.
 * @param contactPoint The ContactPoint object to be indexed.
 */
function buildContactPointToken(
  result: Token[],
  searchParam: SearchParameter,
  contactPoint: ContactPoint | undefined
): void {
  buildSimpleToken(result, searchParam, contactPoint?.system, contactPoint?.value);
}

/**
 * Builds a simple token.
 * @param result The result array where tokens will be added.
 * @param searchParam The search parameter.
 * @param system The token system.
 * @param value The token value.
 */
function buildSimpleToken(
  result: Token[],
  searchParam: SearchParameter,
  system: string | undefined,
  value: string | undefined
): void {
  if (system || value) {
    result.push({
      code: searchParam.code as string,
      system,
      value,
    });
  }
}

/**
 * Returns the existing list of indexed tokens.
 * @param resourceId The FHIR resource ID.
 * @returns Promise for the list of indexed tokens  .
 */
async function getExistingValues(client: PoolClient, resourceType: ResourceType, resourceId: string): Promise<Token[]> {
  const tableName = getTableName(resourceType);
  return new SelectQuery(tableName)
    .column('code')
    .column('system')
    .column('value')
    .where('resourceId', Operator.EQUALS, resourceId)
    .orderBy('index')
    .execute(client)
    .then((result) =>
      result.map((row) => ({
        code: row.code,
        system: row.system,
        value: row.value,
      }))
    );
}

function buildWhereExpression(
  selectQuery: SelectQuery,
  subQuery: SelectQuery,
  tableName: string,
  filter: Filter
): Expression {
  const disjunction = new Disjunction([]);
  for (const option of filter.value.split(',')) {
    disjunction.expressions.push(buildWhereCondition(selectQuery, subQuery, tableName, filter.operator, option));
  }
  return disjunction;
}

function buildWhereCondition(
  selectQuery: SelectQuery,
  subQuery: SelectQuery,
  tableName: string,
  operator: FhirOperator,
  query: string
): Expression {
  const parts = query.split('|');
  if (parts.length === 2) {
    const systemCondition = new Condition(new Column(tableName, 'system'), Operator.EQUALS, parts[0]);
    return parts[1]
      ? new Conjunction([systemCondition, buildValueCondition(selectQuery, subQuery, tableName, operator, parts[1])])
      : systemCondition;
  } else {
    return buildValueCondition(selectQuery, subQuery, tableName, operator, query);
  }
}

function buildValueCondition(
  selectQuery: SelectQuery,
  subQuery: SelectQuery,
  tableName: string,
  operator: FhirOperator,
  value: string
): Expression {
  if (operator === FhirOperator.IN) {
    return buildInValueSetCondition(selectQuery, subQuery, tableName, value);
  }
  const column = new Column(tableName, 'value');
  if (operator === FhirOperator.TEXT) {
    return new Conjunction([
      new Condition(new Column(tableName, 'system'), Operator.EQUALS, 'text'),
      new Condition(column, Operator.LIKE, value.trim() + '%'),
    ]);
  } else if (operator === FhirOperator.CONTAINS) {
    return new Condition(column, Operator.LIKE, value.trim() + '%');
  } else {
    return new Condition(column, Operator.EQUALS, value.trim());
  }
}

/**
 * Adds "where" conditions to the select query builder.
 * @param selectQuery The select query builder.
 * @param resourceType The FHIR resource type.
 * @param predicate The conjunction where conditions should be added.
 * @param filter The search filter details.
 */
function buildInValueSetCondition(
  selectQuery: SelectQuery,
  subQuery: SelectQuery,
  tableName: string,
  value: string
): Condition {
  const joinName = selectQuery.getNextJoinAlias();
  const subSubQuery = new SelectQuery('ValueSet').column('reference').where('url', Operator.EQUALS, value).limit(1);
  subQuery.joinExpr(
    joinName,
    new Condition(new Column(joinName, 'reference'), Operator.ARRAY_CONTAINS, new Column(tableName, 'system')),
    subSubQuery
  );
  return new Condition(new Column(joinName, 'reference'), Operator.NOT_EQUALS, null);
}
