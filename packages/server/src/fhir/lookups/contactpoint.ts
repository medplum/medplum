import { ContactPoint, Filter, Resource, SearchParameter } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { executeQuery, getKnex } from '../../database';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

/**
 * The ContactPointTable class is used to index and search "name" properties on "Person" resources.
 * Each name is represented as a separate row in the "ContactPoint" table.
 */
export class ContactPointTable implements LookupTable {
  private static readonly knownParams: Set<string> = new Set<string>([
    'individual-telecom',
    'individual-email',
    'individual-phone',
    'OrganizationAffiliation-telecom',
    'OrganizationAffiliation-email',
    'OrganizationAffiliation-phone'
  ]);

  /**
   * Returns true if the search parameter is an "" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return ContactPointTable.knownParams.has(searchParam.id as string);
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

    const contactPoints: ContactPoint[] | undefined = resource.telecom;
    if (!contactPoints || !Array.isArray(contactPoints)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getExisting(resourceId);

    if (!compareArrays(contactPoints, existing)) {
      const knex = getKnex();

      if (existing.length > 0) {
        await knex('ContactPoint').where('resourceId', resourceId).delete().then(executeQuery);
      }

      for (let i = 0; i < contactPoints.length; i++) {
        const contactPoint = contactPoints[i];
        await knex('ContactPoint').insert({
          id: randomUUID(),
          resourceId,
          index: i,
          content: JSON.stringify(contactPoint),
          system: contactPoint.system,
          value: contactPoint.value
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
    selectQuery.join('ContactPoint', resourceType + '.id', '=', 'ContactPoint.resourceId');
    selectQuery.where('ContactPoint.value', filter.value);
    if (filter.code !== 'telecom') {
      selectQuery.where('ContactPoint.system', filter.code);
    }
  }

  /**
   * Returns the existing list of indexed names.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed names.
   */
  private async getExisting(resourceId: string): Promise<ContactPoint[]> {
    return getKnex()
      .select('content')
      .from('ContactPoint')
      .where('resourceId', resourceId)
      .orderBy('index')
      .then(result => result.map(row => JSON.parse(row.content) as ContactPoint));
  }
}
