import { ContactPoint, Filter, Resource, SearchParameter, SortRule, stringify } from '@medplum/core';
import { randomUUID } from 'crypto';
import { getClient } from '../../database';
import { DeleteQuery, InsertQuery, Operator, SelectQuery } from '../sql';
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
   * Returns the table name.
   * @returns The table name.
   */
  getName(): string {
    return 'ContactPoint';
  }

  /**
   * Returns true if the search parameter is an "" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return ContactPointTable.knownParams.has(searchParam.id as string);
  }

  /**
   * Deletes a resource from the index.
   * @param resource The resource to delete.
   */
  async deleteResource(resource: Resource): Promise<void> {
    const resourceId = resource.id as string;
    const client = getClient();
    await new DeleteQuery('ContactPoint')
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
      const client = getClient();

      if (existing.length > 0) {
        await this.deleteResource(resource);
      }

      for (let i = 0; i < contactPoints.length; i++) {
        const contactPoint = contactPoints[i];
        await new InsertQuery('ContactPoint', {
          id: randomUUID(),
          resourceId,
          index: i,
          content: stringify(contactPoint),
          system: contactPoint.system,
          value: contactPoint.value
        }).execute(client);
      }
    }
  }

  /**
   * Adds "join" expression to the select query builder.
   * @param selectQuery The select query builder.
   */
  addJoin(selectQuery: SelectQuery): void {
    selectQuery.join('ContactPoint', 'id', 'resourceId');
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addWhere(selectQuery: SelectQuery, filter: Filter): void {
    selectQuery.where(
      { tableName: 'ContactPoint', columnName: 'value' },
      Operator.EQUALS,
      filter.value);

    if (filter.code !== 'telecom') {
      selectQuery.where(
        { tableName: 'ContactPoint', columnName: 'system' },
        Operator.EQUALS,
        filter.code);
    }
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery The select query builder.
   * @param sortRule The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, sortRule: SortRule): void {
    selectQuery.orderBy(
      { tableName: 'ContactPoint', columnName: 'value' },
      sortRule.descending);
  }

  /**
   * Returns the existing list of indexed names.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed names.
   */
  private async getExisting(resourceId: string): Promise<ContactPoint[]> {
    return new SelectQuery('ContactPoint')
      .column('content')
      .where('resourceId', Operator.EQUALS, resourceId)
      .orderBy('index')
      .execute(getClient())
      .then(result => result.map(row => JSON.parse(row.content) as ContactPoint));
  }
}
