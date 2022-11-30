import { Filter, stringify } from '@medplum/core';
import { ContactPoint, Resource, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { Column, Condition, Conjunction, Operator, SelectQuery } from '../sql';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

/**
 * The ContactPointTable class is used to index and search ContactPoint properties.
 * Each ContactPoint is represented as a separate row in the "ContactPoint" table.
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
   * Returns true if the search parameter is an ContactPoint parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an ContactPoint parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return ContactPointTable.#knownParams.has(searchParam.id as string);
  }

  /**
   * Indexes a resource ContactPoint values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param client The database client.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(client: PoolClient, resource: Resource): Promise<void> {
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
      if (existing.length > 0) {
        await this.deleteValuesForResource(resource);
      }

      const values = [];

      for (let i = 0; i < contactPoints.length; i++) {
        const contactPoint = contactPoints[i];
        values.push({
          id: randomUUID(),
          resourceId,
          index: i,
          content: stringify(contactPoint),
          system: contactPoint.system?.trim(),
          value: contactPoint.value?.trim(),
        });
      }

      await this.insertValuesForResource(client, values);
    }
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param selectQuery The select query builder.
   * @param predicate The conjunction where conditions should be added.
   * @param filter The search filter details.
   */
  addWhere(selectQuery: SelectQuery, predicate: Conjunction, filter: Filter): void {
    const tableName = this.getTableName();
    const joinName = selectQuery.getNextJoinAlias();
    const subQuery = new SelectQuery(tableName)
      .raw(`DISTINCT ON ("${tableName}"."resourceId") *`)
      .where({ tableName, columnName: 'value' }, Operator.EQUALS, filter.value?.trim())
      .orderBy('resourceId');

    if (filter.code !== 'telecom') {
      // filter.code can be "email" or "phone"
      subQuery.where({ tableName, columnName: 'system' }, Operator.EQUALS, filter.code?.trim());
    }

    selectQuery.join(joinName, 'id', 'resourceId', subQuery);
    predicate.expressions.push(new Condition(new Column(joinName, 'id'), Operator.NOT_EQUALS, null));
  }
}
