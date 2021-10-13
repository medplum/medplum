import { Filter, formatFamilyName, formatGivenName, formatHumanName, HumanName, Resource, SearchParameter, SortRule, stringify } from '@medplum/core';
import { randomUUID } from 'crypto';
import { getClient } from '../../database';
import { DeleteQuery, InsertQuery, Operator, SelectQuery } from '../sql';
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
   * Returns the table name.
   * @returns The table name.
   */
  getName(): string {
    return 'HumanName';
  }

  /**
   * Returns true if the search parameter is an "" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return HumanNameTable.knownParams.has(searchParam.id as string);
  }

  /**
   * Deletes a resource from the index.
   * @param resource The resource to delete.
   */
  async deleteResource(resource: Resource): Promise<void> {
    const resourceId = resource.id as string;
    const client = getClient();
    await new DeleteQuery('HumanName')
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

    const names: HumanName[] | undefined = resource.name;
    if (!names || !Array.isArray(names)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getNames(resourceId);

    if (!compareArrays(names, existing)) {
      const client = getClient();

      if (existing.length > 0) {
        await this.deleteResource(resource);
      }

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        await new InsertQuery('HumanName', {
          id: randomUUID(),
          resourceId,
          index: i,
          content: stringify(name),
          name: formatHumanName(name),
          given: formatGivenName(name),
          family: formatFamilyName(name)
        }).execute(client);
      }
    }
  }

  /**
   * Adds "join" expression to the select query builder.
   * @param selectQuery The select query builder.
   */
  addJoin(selectQuery: SelectQuery): void {
    selectQuery.join('HumanName', 'id', 'resourceId');
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addWhere(selectQuery: SelectQuery, filter: Filter): void {
    selectQuery.where(
      { tableName: 'HumanName', columnName: filter.code },
      Operator.LIKE,
      '%' + filter.value + '%');
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery The select query builder.
   * @param sortRule The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, sortRule: SortRule): void {
    selectQuery.orderBy(
      { tableName: 'HumanName', columnName: sortRule.code },
      sortRule.descending);
  }

  /**
   * Returns the existing list of indexed names.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed names.
   */
  private async getNames(resourceId: string): Promise<HumanName[]> {
    return new SelectQuery('HumanName')
      .column('content')
      .where('resourceId', Operator.EQUALS, resourceId)
      .orderBy('index')
      .execute(getClient())
      .then(result => result.map(row => JSON.parse(row.content) as HumanName));
  }
}
