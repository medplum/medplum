import { Filter, Identifier, Resource, SearchParameter } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { executeQuery, getKnex } from '../../database';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

/**
 * The IdentifierTable class is used to index and search "identifier" properties.
 * The common case for identifiers is a "system" and "value" key/value pair.
 * Each identifier is represented as a separate row in the "Identifier" table.
 */
export class IdentifierTable implements LookupTable {

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

    const identifiers = resource.identifier;
    if (!identifiers || !Array.isArray(identifiers)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getIdentifiers(resourceId);

    if (!compareArrays(identifiers, existing)) {
      const knex = getKnex();

      if (existing.length > 0) {
        await knex('Identifier').where('resourceId', resourceId).delete().then(executeQuery);
      }

      for (let i = 0; i < identifiers.length; i++) {
        const identifier = identifiers[i];
        await knex('Identifier').insert({
          id: randomUUID(),
          resourceId,
          index: i,
          content: JSON.stringify(identifier),
          system: identifier.system,
          value: identifier.value
        }).then(executeQuery);
      }
    }
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param resourceType The FHIR resource type.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addSearchConditions(resourceType: string, selectQuery: Knex.QueryBuilder, filter: Filter): void {
    selectQuery.join('Identifier', resourceType + '.id', '=', 'Identifier.resourceId');
    selectQuery.where('Identifier.value', filter.value);
  }

  /**
   * Returns the existing list of indexed identifiers.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed identifiers.
   */
  private async getIdentifiers(resourceId: string): Promise<Identifier[]> {
    return getKnex()
      .select('content')
      .from('Identifier')
      .where('resourceId', resourceId)
      .orderBy('index')
      .then(result => result.map(row => JSON.parse(row.content) as Identifier));
  }
}
