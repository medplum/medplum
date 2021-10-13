import { Filter, Identifier, Resource, SearchParameter, SortRule, stringify } from '@medplum/core';
import { randomUUID } from 'crypto';
import { getClient } from '../../database';
import { DeleteQuery, InsertQuery, Operator, SelectQuery } from '../sql';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

/**
 * The IdentifierTable class is used to index and search "identifier" properties.
 * The common case for identifiers is a "system" and "value" key/value pair.
 * Each identifier is represented as a separate row in the "Identifier" table.
 */
export class IdentifierTable implements LookupTable {

  /**
   * Returns the table name.
   * @returns The table name.
   */
  getName(): string {
    return 'Identifier';
  }

  /**
   * Returns true if the search parameter is an "identifier" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return searchParam.code === 'identifier' && searchParam.type === 'token';
  }

  /**
   * Deletes a resource from the index.
   * @param resource The resource to delete.
   */
  async deleteResource(resource: Resource): Promise<void> {
    const resourceId = resource.id as string;
    const client = getClient();
    await new DeleteQuery('Identifier')
      .where('resourceId', Operator.EQUALS, resourceId)
      .execute(client);
  }

  /**
   * Indexes a resource identifier values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(resource: Resource): Promise<void> {
    if (!('identifier' in resource)) {
      return;
    }

    const identifiers = resource.identifier;
    if (!identifiers || !Array.isArray(identifiers)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getIdentifiers(resourceId);

    if (!compareArrays(identifiers, existing)) {
      const client = getClient();

      if (existing.length > 0) {
        await this.deleteResource(resource);
      }

      for (let i = 0; i < identifiers.length; i++) {
        const identifier = identifiers[i];
        await new InsertQuery('Identifier', {
          id: randomUUID(),
          resourceId,
          index: i,
          content: stringify(identifier),
          system: identifier.system,
          value: identifier.value
        }).execute(client);
      }
    }
  }

  /**
   * Adds "join" expression to the select query builder.
   * @param selectQuery The select query builder.
   */
  addJoin(selectQuery: SelectQuery): void {
    selectQuery.join('Identifier', 'id', 'resourceId');
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addWhere(selectQuery: SelectQuery, filter: Filter): void {
    selectQuery.where(
      { tableName: 'Identifier', columnName: 'value' },
      Operator.EQUALS,
      filter.value);
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery The select query builder.
   * @param sortRule The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, sortRule: SortRule): void {
    selectQuery.orderBy(
      { tableName: 'Identifier', columnName: 'value' },
      sortRule.descending);
  }

  /**
   * Returns the existing list of indexed identifiers.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed identifiers.
   */
  private async getIdentifiers(resourceId: string): Promise<Identifier[]> {
    return new SelectQuery('Identifier')
      .column('content')
      .where('resourceId', Operator.EQUALS, resourceId)
      .orderBy('index')
      .execute(getClient())
      .then(result => result.map(row => JSON.parse(row.content) as Identifier));
  }
}
