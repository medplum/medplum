// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Resource, ResourceType } from '@medplum/fhirtypes';
import type { Pool, PoolClient } from 'pg';
import { importConceptMap } from '../operations/conceptmapimport';
import { Column, Condition, Conjunction } from '../sql';
import { LookupTable } from './lookuptable';

/**
 * The ConceptMappingTable class is used to index and search mappings associated with a ConceptMap resource.
 * Each source-target relationship is represented as a separate row in the "ConceptMapping" table.
 */
export class ConceptMappingTable extends LookupTable {
  getTableName(): string {
    return 'ConceptMapping';
  }

  getColumnName(code: string): string {
    return code;
  }

  /**
   * Returns false, because the ConceptMapping table is never used for normal SearchParameter search.
   * @returns Always false.
   */
  isIndexed(): boolean {
    return false;
  }

  extractValues(): object[] {
    throw new Error('ConceptMapping.extractValues not implemented');
  }

  async batchIndexResources<T extends Resource>(
    client: PoolClient,
    resources: WithId<T>[],
    create: boolean
  ): Promise<void> {
    for (const resource of resources) {
      if (resource.resourceType === 'ConceptMap' && resource.group?.length) {
        if (!create) {
          await this.deleteValuesForResource(client, resource);
        }
        await importConceptMap(client, resource);
      }
    }
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client - The database client.
   * @param resource - The resource to delete.
   */
  async deleteValuesForResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    const resourceType = resource.resourceType;
    if (resourceType !== 'ConceptMap') {
      return;
    }

    const linkedToTargetResource = new Conjunction([
      new Condition(new Column(resourceType, 'id'), '=', new Column('ConceptMapping', 'conceptMap')),
      new Condition(new Column(resourceType, 'id'), '=', resource.id),
    ]);

    await LookupTable.purge(
      client,
      'ConceptMapping_Attribute',
      {
        tableName: 'ConceptMapping',
        joinCondition: new Condition(
          new Column('ConceptMapping_Attribute', 'mapping'),
          '=',
          new Column('ConceptMapping', 'id')
        ),
      },
      { tableName: resourceType, joinCondition: linkedToTargetResource }
    );

    await LookupTable.purge(client, 'ConceptMapping', {
      tableName: resourceType,
      joinCondition: linkedToTargetResource,
    });
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param client - The database client.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeValuesBefore(client: Pool | PoolClient, resourceType: ResourceType, before: string): Promise<void> {
    if (resourceType !== 'ConceptMap') {
      return;
    }

    const resourceOlderThanCutoff = new Conjunction([
      new Condition(new Column('ConceptMapping', 'conceptMap'), '=', new Column(resourceType, 'id')),
      new Condition(new Column(resourceType, 'lastUpdated'), '<', before),
    ]);

    await LookupTable.purge(
      client,
      'ConceptMapping_Attribute',
      {
        tableName: 'ConceptMapping',
        joinCondition: new Condition(
          new Column('ConceptMapping_Attribute', 'mapping'),
          '=',
          new Column('ConceptMapping', 'id')
        ),
      },
      {
        tableName: 'ConceptMap',
        joinCondition: resourceOlderThanCutoff,
      }
    );

    await LookupTable.purge(client, 'ConceptMapping', {
      tableName: 'ConceptMap',
      joinCondition: resourceOlderThanCutoff,
    });
  }
}
