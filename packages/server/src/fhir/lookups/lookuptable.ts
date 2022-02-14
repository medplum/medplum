import { Filter, SortRule } from '@medplum/core';
import { Resource, SearchParameter } from '@medplum/fhirtypes';
import { getClient } from '../../database';
import { DeleteQuery, Operator, SelectQuery } from '../sql';

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
   * @returns The unique name of the lookup table.
   */
  abstract getTableName(): string;

  /**
   * Returns the column name for the given search parameter.
   * @param code The search parameter code.
   */
  abstract getColumnName(code: string): string;

  /**
   * Determines if the search parameter is indexed by this index table.
   * @param searchParam The search parameter.
   */
  abstract isIndexed(searchParam: SearchParameter): boolean;

  /**
   * Indexes the resource in the lookup table.
   * @param resource The resource to index.
   */
  abstract indexResource(resource: Resource): Promise<void>;

  /**
   * Adds "where" conditions to the select query builder.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addWhere(selectQuery: SelectQuery, filter: Filter): void {
    const tableName = this.getTableName();
    const joinName = tableName + '_' + filter.code + '_search';
    const columnName = this.getColumnName(filter.code);
    const subQuery = new SelectQuery(tableName)
      .raw(`DISTINCT ON ("${tableName}"."resourceId") *`)
      .where({ tableName, columnName }, Operator.LIKE, '%' + filter.value + '%')
      .orderBy('resourceId');
    selectQuery.join(joinName, 'id', 'resourceId', subQuery);
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery The select query builder.
   * @param sortRule The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, sortRule: SortRule): void {
    const tableName = this.getTableName();
    const joinName = tableName + '_' + sortRule.code + '_sort';
    const columnName = this.getColumnName(sortRule.code);
    const subQuery = new SelectQuery(tableName)
      .raw(`DISTINCT ON ("${tableName}"."resourceId") *`)
      .orderBy('resourceId');
    selectQuery.join(joinName, 'id', 'resourceId', subQuery);
    selectQuery.orderBy({ tableName: joinName, columnName }, sortRule.descending);
  }

  /**
   * Returns the existing list of indexed addresses.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed addresses.
   */
  async getExistingValues(resourceId: string): Promise<T[]> {
    const tableName = this.getTableName();
    return new SelectQuery(tableName)
      .column('content')
      .where('resourceId', Operator.EQUALS, resourceId)
      .orderBy('index')
      .execute(getClient())
      .then((result) => result.map((row) => JSON.parse(row.content) as T));
  }

  /**
   * Deletes the resource from the lookup table.
   * @param resource The resource to delete.
   */
  async deleteValuesForResource(resource: Resource): Promise<void> {
    const tableName = this.getTableName();
    const resourceId = resource.id as string;
    const client = getClient();
    await new DeleteQuery(tableName).where('resourceId', Operator.EQUALS, resourceId).execute(client);
  }
}
