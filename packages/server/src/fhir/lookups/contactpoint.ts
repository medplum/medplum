import { Filter, stringify } from '@medplum/core';
import { ContactPoint, Resource, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getClient } from '../../database';
import { InsertQuery, Operator, SelectQuery } from '../sql';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

/**
 * The ContactPointTable class is used to index and search "name" properties on "Person" resources.
 * Each name is represented as a separate row in the "ContactPoint" table.
 */
export class ContactPointTable extends LookupTable<ContactPoint> {
  static readonly #knownParams: Set<string> = new Set<string>([
    'individual-telecom',
    'individual-email',
    'individual-phone',
    'OrganizationAffiliation-telecom',
    'OrganizationAffiliation-email',
    'OrganizationAffiliation-phone',
  ]);

  /**
   * Returns the table name.
   * @returns The table name.
   */
  getTableName(): string {
    return 'ContactPoint';
  }

  /**
   * Returns the column name for the given search parameter.
   */
  getColumnName(): string {
    return 'value';
  }

  /**
   * Returns true if the search parameter is an "" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return ContactPointTable.#knownParams.has(searchParam.id as string);
  }

  /**
   * Indexes a resource identifier values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(resource: Resource): Promise<void> {
    if (
      resource.resourceType !== 'Patient' &&
      resource.resourceType !== 'Person' &&
      resource.resourceType !== 'Practitioner' &&
      resource.resourceType !== 'RelatedPerson'
    ) {
      return;
    }

    const contactPoints: ContactPoint[] | undefined = resource.telecom;
    if (!contactPoints || !Array.isArray(contactPoints)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getExistingValues(resourceId);

    if (!compareArrays(contactPoints, existing)) {
      const client = getClient();

      if (existing.length > 0) {
        await this.deleteValuesForResource(resource);
      }

      for (let i = 0; i < contactPoints.length; i++) {
        const contactPoint = contactPoints[i];
        await new InsertQuery('ContactPoint', {
          id: randomUUID(),
          resourceId,
          index: i,
          content: stringify(contactPoint),
          system: contactPoint.system,
          value: contactPoint.value,
        }).execute(client);
      }
    }
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addWhere(selectQuery: SelectQuery, filter: Filter): void {
    const tableName = this.getTableName();
    const joinName = tableName + '_' + filter.code + '_search';
    const subQuery = new SelectQuery(tableName)
      .raw(`DISTINCT ON ("${tableName}"."resourceId") *`)
      .where({ tableName, columnName: 'value' }, Operator.EQUALS, filter.value)
      .orderBy('resourceId');

    if (filter.code !== 'telecom') {
      // filter.code can be "email" or "phone"
      subQuery.where({ tableName, columnName: 'system' }, Operator.EQUALS, filter.code);
    }

    selectQuery.join(joinName, 'id', 'resourceId', subQuery);
  }
}
