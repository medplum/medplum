import { Filter, formatFamilyName, formatGivenName, formatHumanName, HumanName, Resource, SearchParameter } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { executeQuery, getKnex } from '../../database';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

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
    return HumanNameTable.knownParams.has(searchParam.id as string);
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

    if (!compareArrays(names, existing)) {
      const knex = getKnex();

      if (existing.length > 0) {
        await knex('HumanName').where('resourceId', resourceId).delete().then(executeQuery);
      }

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        await knex('HumanName').insert({
          id: randomUUID(),
          resourceId,
          index: i,
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
      .orderBy('index')
      .then(result => result.map(row => JSON.parse(row.content) as HumanName));
  }
}
