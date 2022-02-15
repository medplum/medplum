import { stringify } from '@medplum/core';
import { Identifier, Resource, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getClient } from '../../database';
import { InsertQuery } from '../sql';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

/**
 * The IdentifierTable class is used to index and search "identifier" properties.
 * The common case for identifiers is a "system" and "value" key/value pair.
 * Each identifier is represented as a separate row in the "Identifier" table.
 */
export class IdentifierTable extends LookupTable<Identifier> {
  /**
   * Returns the table name.
   * @returns The table name.
   */
  getTableName(): string {
    return 'Identifier';
  }

  /**
   * Returns the column name for the given search parameter.
   */
  getColumnName(): string {
    return 'value';
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
   * Indexes a resource identifier values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(resource: Resource): Promise<void> {
    if (!('identifier' in resource)) {
      return;
    }

    const identifiers = resource.identifier as Identifier[];
    const resourceId = resource.id as string;
    const existing = await this.getExistingValues(resourceId);

    if (!compareArrays(identifiers, existing)) {
      const client = getClient();

      if (existing.length > 0) {
        await this.deleteValuesForResource(resource);
      }

      for (let i = 0; i < identifiers.length; i++) {
        const identifier = identifiers[i];
        await new InsertQuery('Identifier', {
          id: randomUUID(),
          resourceId,
          index: i,
          content: stringify(identifier),
          system: identifier.system,
          value: identifier.value,
        }).execute(client);
      }
    }
  }
}
