// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId } from '@medplum/core';
import { Resource, ResourceType } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { importConceptMap } from '../operations/conceptmapimport';
import { Column, DeleteQuery } from '../sql';
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
    if (resource.resourceType !== 'ConceptMap') {
      return;
    }

    // Delete ConceptMapping_Attribute entries with a join
    await new DeleteQuery('ConceptMapping_Attribute')
      .using('ConceptMapping')
      .where(new Column('ConceptMapping_Attribute', 'mapping'), '=', new Column('ConceptMapping', 'id'))
      .where(new Column('ConceptMapping', 'conceptMap'), '=', resource.id)
      .execute(client);

    // Delete ConceptMapping entries
    await new DeleteQuery('ConceptMapping').where('conceptMap', '=', resource.id).execute(client);
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

    // Delete ConceptMapping_Attribute entries with a double join
    await new DeleteQuery('ConceptMapping_Attribute')
      .using('ConceptMap', 'ConceptMapping')
      .where(new Column('ConceptMapping_Attribute', 'mapping'), '=', new Column('Coding', 'id'))
      .where(new Column('ConceptMapping', 'conceptMap'), '=', new Column('ConceptMap', 'id'))
      .where(new Column('ConceptMap', 'lastUpdated'), '<', before)
      .execute(client);

    // Delete ConceptMapping entries
    await new DeleteQuery('ConceptMapping')
      .using('ConceptMap')
      .where(new Column('ConceptMapping', 'conceptMap'), '=', new Column('ConceptMap', 'id'))
      .where(new Column('ConceptMap', 'lastUpdated'), '<', before)
      .execute(client);
  }
}
