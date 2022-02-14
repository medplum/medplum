import { formatFamilyName, formatGivenName, formatHumanName, stringify } from '@medplum/core';
import { HumanName, Resource, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getClient } from '../../database';
import { InsertQuery } from '../sql';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

/**
 * The HumanNameTable class is used to index and search "name" properties on "Person" resources.
 * Each name is represented as a separate row in the "HumanName" table.
 */
export class HumanNameTable extends LookupTable<HumanName> {
  static readonly #knownParams: Set<string> = new Set<string>([
    'individual-given',
    'individual-family',
    'Patient-name',
    'Person-name',
    'Practitioner-name',
    'RelatedPerson-name',
  ]);

  /**
   * Returns the table name.
   * @returns The table name.
   */
  getTableName(): string {
    return 'HumanName';
  }

  /**
   * Returns the column name for the given search parameter.
   * @param code The search parameter code.
   */
  getColumnName(code: string): string {
    return code;
  }

  /**
   * Returns true if the search parameter is an "" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return HumanNameTable.#knownParams.has(searchParam.id as string);
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

    const names: HumanName[] | undefined = resource.name;
    if (!names || !Array.isArray(names)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getExistingValues(resourceId);

    if (!compareArrays(names, existing)) {
      const client = getClient();

      if (existing.length > 0) {
        await this.deleteValuesForResource(resource);
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
          family: formatFamilyName(name),
        }).execute(client);
      }
    }
  }
}
