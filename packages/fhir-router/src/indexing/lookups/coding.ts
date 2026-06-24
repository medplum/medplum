import type { WithId } from '@medplum/core';
import type { Resource, ResourceType } from '@medplum/fhirtypes';
import type { SqlConnection } from '../../sql/sql.js';
import { Column, Condition, Conjunction } from '../../sql/sql.js';
import { LookupTable } from './lookuptable';

/**
 * The CodingTable class is used to index and search Coding values associated with a CodeSystem.
 * Each system/code/display triple is represented as a separate row in the "Coding" table.
 */
export class CodingTable extends LookupTable {
  getTableName(): string {
    return 'Coding';
  }

  getColumnName(code: string): string {
    return code;
  }

  /**
   * Returns false, because the Coding table is never used for normal SearchParameter search.
   * @returns Always false.
   */
  isIndexed(): boolean {
    return false;
  }

  extractValues(): object[] {
    throw new Error('CodingTable.extractValues not implemented');
  }

  async batchIndexResources<T extends Resource>(
    _client: SqlConnection,
    _resources: WithId<T>[],
    _create: boolean
  ): Promise<void> {
    // CodeSystem import indexing is not required for the mock SQLite repository.
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client - The database client.
   * @param resource - The resource to delete.
   */
  async deleteValuesForResource(client: SqlConnection, resource: Resource): Promise<void> {
    const resourceType = resource.resourceType;
    if (resourceType !== 'CodeSystem') {
      return;
    }

    await LookupTable.purge(client, 'CodeSystem_Property', {
      tableName: resourceType,
      joinCondition: new Conjunction([
        new Condition(new Column(resourceType, 'id'), '=', new Column('CodeSystem_Property', 'system')),
        new Condition(new Column(resourceType, 'id'), '=', resource.id),
      ]),
    });

    await LookupTable.purge(client, 'Coding_Property', {
      tableName: 'Coding',
      joinCondition: new Conjunction([
        new Condition(new Column('Coding_Property', 'coding'), '=', new Column('Coding', 'id')),
        new Condition(new Column('Coding', 'system'), '=', resource.id),
      ]),
    });

    await LookupTable.purge(client, 'Coding', {
      tableName: resourceType,
      joinCondition: new Conjunction([
        new Condition(new Column(resourceType, 'id'), '=', new Column('Coding', 'system')),
        new Condition(new Column(resourceType, 'id'), '=', resource.id),
      ]),
    });
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param client - The database client.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeValuesBefore(client: SqlConnection, resourceType: ResourceType, before: string): Promise<void> {
    if (resourceType !== 'CodeSystem') {
      return;
    }

    const resourceOlderThanCutoff = new Condition(new Column(resourceType, 'lastUpdated'), '<', before);

    await LookupTable.purge(client, 'CodeSystem_Property', {
      tableName: resourceType,
      joinCondition: new Conjunction([
        new Condition(new Column(resourceType, 'id'), '=', new Column('CodeSystem_Property', 'system')),
        resourceOlderThanCutoff,
      ]),
    });

    await LookupTable.purge(
      client,
      'Coding_Property',
      {
        tableName: 'Coding',
        joinCondition: new Condition(new Column('Coding_Property', 'coding'), '=', new Column('Coding', 'id')),
      },
      {
        tableName: resourceType,
        joinCondition: new Conjunction([
          new Condition(new Column('Coding', 'system'), '=', new Column(resourceType, 'id')),
          resourceOlderThanCutoff,
        ]),
      }
    );

    await LookupTable.purge(client, 'Coding', {
      tableName: 'CodeSystem',
      joinCondition: new Conjunction([
        new Condition(new Column(resourceType, 'id'), '=', new Column('Coding', 'system')),
        resourceOlderThanCutoff,
      ]),
    });
  }
}
