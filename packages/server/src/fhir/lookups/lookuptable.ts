import { Operator as FhirOperator, Filter, SortRule } from '@medplum/core';
import { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import {
  Column,
  Condition,
  Conjunction,
  DeleteQuery,
  Disjunction,
  Expression,
  InsertQuery,
  Operator,
  SelectQuery,
} from '../sql';

/**
 * The LookupTable interface is used for search parameters that are indexed in separate tables.
 * This is necessary for array properties with specific structure.
 * Common examples include:
 *   1) Identifiers - arbitrary key/value pairs on many different resource types
 *   2) Human Names - structured names on Patients, Practitioners, and other person resource types
 *   3) Contact Points - email addresses and phone numbers
 */
export abstract class LookupTable<T> {
  /**
   * Returns the unique name of the lookup table.
   * @param resourceType The resource type.
   * @returns The unique name of the lookup table.
   */
  protected abstract getTableName(resourceType: ResourceType): string;

  /**
   * Returns the column name for the given search parameter.
   * @param code The search parameter code.
   */
  protected abstract getColumnName(code: string): string;

  /**
   * Determines if the search parameter is indexed by this index table.
   * @param searchParam The search parameter.
   * @param resourceType The resource type.
   * @returns True if the search parameter is indexed.
   */
  abstract isIndexed(searchParam: SearchParameter, resourceType: string): boolean;

  /**
   * Indexes the resource in the lookup table.
   * @param client The database client.
   * @param resource The resource to index.
   */
  abstract indexResource(client: PoolClient, resource: Resource): Promise<void>;

  /**
   * Builds a "where" condition for the select query builder.
   * @param selectQuery The select query builder.
   * @param resourceType The FHIR resource type.
   * @param filter The search filter details.
   * @returns The select query where expression.
   */
  buildWhere(selectQuery: SelectQuery, resourceType: ResourceType, filter: Filter): Expression {
    const tableName = this.getTableName(resourceType);
    const joinName = selectQuery.getNextJoinAlias();
    const columnName = this.getColumnName(filter.code);
    const joinOnExpression = new Conjunction([
      new Condition(new Column(resourceType, 'id'), Operator.EQUALS, new Column(joinName, 'resourceId')),
    ]);

    const disjunction = new Disjunction([]);
    for (const option of filter.value.split(',')) {
      if (filter.operator === FhirOperator.EXACT) {
        disjunction.expressions.push(new Condition(new Column(joinName, columnName), Operator.EQUALS, option.trim()));
      } else if (filter.operator === FhirOperator.CONTAINS) {
        disjunction.expressions.push(new Condition(new Column(joinName, columnName), Operator.LIKE, `%${option}%`));
      } else {
        disjunction.expressions.push(
          new Condition(
            new Column(joinName, columnName + '_tsv'),
            Operator.TSVECTOR_MATCH,
            option
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .map((token) => token + ':*')
              .join(' & ')
          )
        );
      }
    }

    joinOnExpression.expressions.push(disjunction);
    selectQuery.innerJoin(tableName, joinName, joinOnExpression);
    selectQuery.orderBy(new Column(joinName, columnName));
    return new Condition(new Column(joinName, 'resourceId'), Operator.NOT_EQUALS, null);
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery The select query builder.
   * @param resourceType The FHIR resource type.
   * @param sortRule The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, resourceType: ResourceType, sortRule: SortRule): void {
    const tableName = this.getTableName(resourceType);
    const joinName = selectQuery.getNextJoinAlias();
    const columnName = this.getColumnName(sortRule.code);
    const joinOnExpression = new Condition(
      new Column(resourceType, 'id'),
      Operator.EQUALS,
      new Column(joinName, 'resourceId')
    );
    selectQuery.innerJoin(tableName, joinName, joinOnExpression);
    selectQuery.orderBy(new Column(joinName, columnName), sortRule.descending);
  }

  /**
   * Returns the existing list of indexed addresses.
   * @param client The database client.
   * @param resourceType The FHIR resource type.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed addresses.
   */
  protected async getExistingValues(
    client: Pool | PoolClient,
    resourceType: ResourceType,
    resourceId: string
  ): Promise<T[]> {
    const tableName = this.getTableName(resourceType);
    return new SelectQuery(tableName)
      .column('content')
      .where('resourceId', Operator.EQUALS, resourceId)
      .orderBy('index')
      .execute(client)
      .then((result) => result.map((row) => JSON.parse(row.content) as T));
  }

  /**
   * Inserts values into the lookup table for a resource.
   * @param client The database client.
   * @param resourceType The resource type.
   * @param values The values to insert.
   */
  protected async insertValuesForResource(
    client: Pool | PoolClient,
    resourceType: ResourceType,
    values: Record<string, any>[]
  ): Promise<void> {
    if (values.length === 0) {
      return;
    }
    const tableName = this.getTableName(resourceType);
    await new InsertQuery(tableName, values).execute(client);
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client The database client.
   * @param resource The resource to delete.
   */
  async deleteValuesForResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    const tableName = this.getTableName(resource.resourceType);
    const resourceId = resource.id as string;
    await new DeleteQuery(tableName).where('resourceId', Operator.EQUALS, resourceId).execute(client);
  }
}
