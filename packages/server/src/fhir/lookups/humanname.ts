import { Filter, formatFamilyName, formatGivenName, formatHumanName, HumanName, Resource, SearchParameter } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { executeQuery, getKnex } from '../../database';
import { LookupTable } from './lookuptable';

/**
 * The HumanNameTable class is used to index and search "name" properties on "Person" resources.
 * Each name is represented as a separate row in the "HumanName" table.
 */
export class HumanNameTable implements LookupTable {
  private static readonly knownParams: Set<string> = new Set<string>([
    'individual-given',
    'individual-family',
    'Patient-name',
    'Person-name',
    'Practitioner-name',
    'RelatedPerson-name'
  ]);

  /**
   * Returns true if the search parameter is an "" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    if (!searchParam.id) {
      return false;
    }
    return HumanNameTable.knownParams.has(searchParam.id);
  }

  /**
   * Indexes a resource identifier values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(resource: Resource): Promise<void> {
    if (resource.resourceType !== 'Patient' &&
      resource.resourceType !== 'Person' &&
      resource.resourceType !== 'Practitioner' &&
      resource.resourceType !== 'RelatedPerson') {
      return;
    }

    const names: HumanName[] | undefined = resource.name;
    if (!names || !Array.isArray(names)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getNames(resourceId);

    if (!this.compareNames(names, existing)) {
      const knex = getKnex();

      if (existing.length > 0) {
        await knex('HumanName').where('resourceId', resourceId).delete().then(executeQuery);
      }

      for (const name of names) {
        await knex('HumanName').insert({
          id: randomUUID(),
          resourceId,
          content: JSON.stringify(name),
          name: formatHumanName(name),
          given: formatGivenName(name),
          family: formatFamilyName(name)
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
    selectQuery.join('HumanName', resourceType + '.id', '=', 'HumanName.resourceId');
    selectQuery.where('HumanName.' + filter.code, 'LIKE', '%' + filter.value + '%');
  }

  /**
   * Returns the existing list of indexed names.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed names.
   */
  private async getNames(resourceId: string): Promise<HumanName[]> {
    return getKnex()
      .select('content')
      .from('HumanName')
      .where('resourceId', resourceId)
      .then(result => result.map(row => JSON.parse(row.content) as HumanName));
  }

  /**
   * Determines if two lists of names are equal.
   * @param incoming The incoming list of names.
   * @param existing The existing list of names.
   * @returns True if the lists are equivalent; false otherwise.
   */
  private compareNames(incoming: HumanName[], existing: HumanName[]): boolean {
    if (incoming.length !== existing.length) {
      return false;
    }

    const incomingNames = incoming.map(name => formatHumanName(name)).sort((a, b) => a.localeCompare(b));
    const existingNames = incoming.map(name => formatHumanName(name)).sort((a, b) => a.localeCompare(b));

    for (let i = 0; i < incomingNames.length; i++) {
      if (incomingNames[i] !== existingNames[i]) {
        return false;
      }
    }

    return true;
  }
}
