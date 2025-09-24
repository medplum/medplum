// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatFamilyName, formatGivenName, formatHumanName, WithId } from '@medplum/core';
import {
  HumanName,
  Patient,
  Person,
  Practitioner,
  RelatedPerson,
  Resource,
  ResourceType,
  SearchParameter,
} from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { Column, DeleteQuery } from '../sql';
import { LookupTable, LookupTableRow } from './lookuptable';

const resourceTypes = ['Patient', 'Person', 'Practitioner', 'RelatedPerson'] as const;
const resourceTypeSet = new Set(resourceTypes);
type HumanNameResourceType = (typeof resourceTypes)[number];
type HumanNameResource = Patient | Person | Practitioner | RelatedPerson;

export interface HumanNameTableRow extends LookupTableRow {
  name: string | undefined;
  given: string | undefined;
  family: string | undefined;
}

/**
 * The HumanNameTable class is used to index and search "name" properties on "Person" resources.
 * Each name is represented as a separate row in the "HumanName" table.
 */
export class HumanNameTable extends LookupTable {
  private static readonly knownParams: Set<string> = new Set<string>([
    'individual-given',
    'individual-family',
    'Patient-name',
    'Person-name',
    'Practitioner-name',
    'RelatedPerson-name',
  ]);

  private static hasHumanName(resourceType: ResourceType): resourceType is HumanNameResourceType {
    return resourceTypeSet.has(resourceType as any);
  }

  protected readonly CONTAINS_SQL_OPERATOR: LookupTable['CONTAINS_SQL_OPERATOR'] = 'ILIKE';

  /**
   * Returns the table name.
   * @returns The table name.
   */
  getTableName(): string {
    return 'HumanName';
  }

  /**
   * Returns the column name for the given search parameter.
   * @param code - The search parameter code.
   * @returns The column name.
   */
  getColumnName(code: string): string {
    return code;
  }

  /**
   * Returns true if the search parameter is an HumanName parameter.
   * @param searchParam - The search parameter.
   * @returns True if the search parameter is an HumanName parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return HumanNameTable.knownParams.has(searchParam.id as string);
  }

  extractValues(result: HumanNameTableRow[], resource: WithId<Resource>): void {
    if (!HumanNameTable.hasHumanName(resource.resourceType)) {
      return;
    }

    const names: (HumanName | undefined | null)[] | undefined = (resource as HumanNameResource).name;
    if (!Array.isArray(names)) {
      return;
    }
    for (const name of names) {
      if (!name) {
        continue;
      }

      const extracted = {
        resourceId: resource.id,
        // logical OR coalesce to ensure that empty strings are inserted as NULL
        name: getNameString(name) || undefined,
        given: formatGivenName(name) || undefined,
        family: formatFamilyName(name) || undefined,
      };

      if (
        (extracted.name || extracted.given || extracted.family) &&
        !result.some(
          (n) =>
            n.resourceId === extracted.resourceId &&
            n.name === extracted.name &&
            n.given === extracted.given &&
            n.family === extracted.family
        )
      ) {
        result.push(extracted);
      }
    }
  }

  async batchIndexResources<T extends Resource>(
    client: PoolClient,
    resources: WithId<T>[],
    create: boolean
  ): Promise<void> {
    if (!resources[0] || !HumanNameTable.hasHumanName(resources[0].resourceType)) {
      return;
    }

    await super.batchIndexResources(client, resources, create);
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client - The database client.
   * @param resource - The resource to delete.
   */
  async deleteValuesForResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    if (!HumanNameTable.hasHumanName(resource.resourceType)) {
      return;
    }

    const tableName = this.getTableName();
    const resourceId = resource.id;
    await new DeleteQuery(tableName).where('resourceId', '=', resourceId).execute(client);
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param client - The database client.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeValuesBefore(client: Pool | PoolClient, resourceType: ResourceType, before: string): Promise<void> {
    if (!HumanNameTable.hasHumanName(resourceType)) {
      return;
    }

    const lookupTableName = this.getTableName();
    await new DeleteQuery(lookupTableName)
      .using(resourceType)
      .where(new Column(lookupTableName, 'resourceId'), '=', new Column(resourceType, 'id'))
      .where(new Column(resourceType, 'lastUpdated'), '<', before)
      .execute(client);
  }
}

/**
 * Returns a string representation of the human name for indexing.
 *
 * In previous versions, we simply used `formatHumanName(name)`.
 *
 * However, the FHIR spec indicates that the `text` field should be used for indexing.
 *
 * Quote:
 *
 *   "The given name parts may contain whitespace, though generally they don't.
 *    Initials may be used in place of the full name if that is all that is recorded.
 *    Systems that operate across cultures should generally rely on the text form for
 *    presentation and use the parts for index/search functionality. For this reason,
 *    applications SHOULD populate the text element for future robustness."
 *
 * @param name - The input human name.
 * @returns A string representation of the human name.
 */
export function getNameString(name: HumanName): string {
  let result = formatHumanName(name);

  if (name.text) {
    // Add unique tokens from the text field
    const resultTokens = getTokens(result);
    const textTokens = getTokens(name.text);
    for (const token of textTokens) {
      if (!resultTokens.has(token)) {
        result += ' ' + token;
        resultTokens.add(token);
      }
    }
  }

  return result;
}

function getTokens(input: string): Set<string> {
  if (!input || typeof input !== 'string') {
    return new Set();
  }

  // Convert to lowercase
  // Split on whitespace
  // Remove empty strings
  return new Set<string>(input.toLowerCase().split(/\s+/).filter(Boolean));
}
