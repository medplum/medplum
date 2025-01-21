import { Operator as FhirOperator, Filter, SortRule, splitSearchOnComma } from '@medplum/core';
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
  Negation,
  SelectQuery,
  SqlFunction,
  escapeLikeString,
} from '../sql';

export const lookupTableBatchSize = 5_000;

/**
 * The LookupTable interface is used for search parameters that are indexed in separate tables.
 * This is necessary for array properties with specific structure.
 * Common examples include:
 *   1) Identifiers - arbitrary key/value pairs on many different resource types
 *   2) Human Names - structured names on Patients, Practitioners, and other person resource types
 *   3) Contact Points - email addresses and phone numbers
 */
export abstract class LookupTable {
  /**
   * Returns the unique name of the lookup table.
   * @param resourceType - The resource type.
   * @returns The unique name of the lookup table.
   */
  protected abstract getTableName(resourceType: ResourceType): string;

  /**
   * Returns the column name for the given search parameter.
   * @param code - The search parameter code.
   */
  protected abstract getColumnName(code: string): string;

  /**
   * Determines if the search parameter is indexed by this index table.
   * @param searchParam - The search parameter.
   * @param resourceType - The resource type.
   * @returns True if the search parameter is indexed.
   */
  abstract isIndexed(searchParam: SearchParameter, resourceType: string): boolean;

  /**
   * Indexes the resource in the lookup table.
   * @param client - The database client.
   * @param resource - The resource to index.
   * @param create - True if the resource should be created (vs updated).
   */
  abstract indexResource(client: PoolClient, resource: Resource, create: boolean): Promise<void>;

  /**
   * Builds a "where" condition for the select query builder.
   * @param _selectQuery - The select query builder.
   * @param resourceType - The FHIR resource type.
   * @param table - The resource table.
   * @param _param - The search parameter.
   * @param filter - The search filter details.
   * @returns The select query where expression.
   */
  buildWhere(
    _selectQuery: SelectQuery,
    resourceType: ResourceType,
    table: string,
    _param: SearchParameter,
    filter: Filter
  ): Expression {
    const lookupTableName = this.getTableName(resourceType);
    const columnName = this.getColumnName(filter.code);

    const disjunction = new Disjunction([]);
    for (const option of splitSearchOnComma(filter.value)) {
      if (filter.operator === FhirOperator.EXACT) {
        disjunction.expressions.push(new Condition(new Column(lookupTableName, columnName), '=', option.trim()));
      } else if (filter.operator === FhirOperator.CONTAINS) {
        disjunction.expressions.push(
          new Condition(new Column(lookupTableName, columnName), 'LIKE', `%${escapeLikeString(option)}%`)
        );
      } else {
        disjunction.expressions.push(
          new Condition(
            new Column(lookupTableName, columnName),
            'TSVECTOR_SIMPLE',
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

    const exists = new SqlFunction('EXISTS', [
      new SelectQuery(lookupTableName).whereExpr(
        new Conjunction([
          new Condition(new Column(table, 'id'), '=', new Column(lookupTableName, 'resourceId')),
          disjunction,
        ])
      ),
    ]);

    if (filter.operator === FhirOperator.NOT_EQUALS || filter.operator === FhirOperator.NOT) {
      return new Negation(exists);
    } else {
      return exists;
    }
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery - The select query builder.
   * @param resourceType - The FHIR resource type.
   * @param sortRule - The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, resourceType: ResourceType, sortRule: SortRule): void {
    const lookupTableName = this.getTableName(resourceType);
    const joinName = selectQuery.getNextJoinAlias();
    const columnName = this.getColumnName(sortRule.code);
    const joinOnExpression = new Condition(new Column(resourceType, 'id'), '=', new Column(joinName, 'resourceId'));
    selectQuery.join(
      'INNER JOIN',
      new SelectQuery(lookupTableName).distinctOn('resourceId').column('resourceId').column(columnName),
      joinName,
      joinOnExpression
    );
    selectQuery.orderBy(new Column(joinName, columnName), sortRule.descending);
  }

  /**
   * Inserts values into the lookup table for a resource.
   * @param client - The database client.
   * @param resourceType - The resource type.
   * @param values - The values to insert.
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
    for (let i = 0; i < values.length; i += lookupTableBatchSize) {
      const batchedValues = values.slice(i, i + lookupTableBatchSize);
      const insert = new InsertQuery(tableName, batchedValues);
      await insert.execute(client);
    }
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client - The database client.
   * @param resource - The resource to delete.
   */
  async deleteValuesForResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    const tableName = this.getTableName(resource.resourceType);
    const resourceId = resource.id as string;
    await new DeleteQuery(tableName).where('resourceId', '=', resourceId).execute(client);
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param client - The database client.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeValuesBefore(client: Pool | PoolClient, resourceType: ResourceType, before: string): Promise<void> {
    const lookupTableName = this.getTableName(resourceType);
    await new DeleteQuery(lookupTableName)
      .using(resourceType)
      .where(new Column(lookupTableName, 'resourceId'), '=', new Column(resourceType, 'id'))
      .where(new Column(resourceType, 'lastUpdated'), '<', before)
      .execute(client);
  }
}
