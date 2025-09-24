// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { append, WithId } from '@medplum/core';
import {
  CodeSystem,
  CodeSystemConcept,
  CodeSystemConceptProperty,
  Coding,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { importCodeSystem, ImportedProperty } from '../operations/codesystemimport';
import { parentProperty } from '../operations/utils/terminology';
import { Column, DeleteQuery } from '../sql';
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
    client: PoolClient,
    resources: WithId<T>[],
    create: boolean
  ): Promise<void> {
    for (const resource of resources) {
      if (
        resource.resourceType === 'CodeSystem' &&
        (resource.content === 'complete' || resource.content === 'example')
      ) {
        if (!create) {
          await this.deleteValuesForResource(client, resource);
        }

        const elements = this.getCodeSystemElements(resource);
        await importCodeSystem(client, resource, elements.concepts, elements.properties);
      }
    }
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client - The database client.
   * @param resource - The resource to delete.
   */
  async deleteValuesForResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    if (resource.resourceType !== 'CodeSystem') {
      return;
    }

    // Delete CodeSystem_Property entries
    await new DeleteQuery('CodeSystem_Property').where('system', '=', resource.id).execute(client);

    // Delete Coding_Property entries with a join
    await new DeleteQuery('Coding_Property')
      .using('Coding')
      .where(new Column('Coding_Property', 'coding'), '=', new Column('Coding', 'id'))
      .where(new Column('Coding', 'system'), '=', resource.id)
      .execute(client);

    // Delete Coding entries
    await new DeleteQuery('Coding').where('system', '=', resource.id).execute(client);
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param client - The database client.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeValuesBefore(client: Pool | PoolClient, resourceType: ResourceType, before: string): Promise<void> {
    if (resourceType !== 'CodeSystem') {
      return;
    }

    // Delete CodeSystem_Property entries
    await new DeleteQuery('CodeSystem_Property')
      .using('CodeSystem')
      .where(new Column('CodeSystem_Property', 'system'), '=', new Column('CodeSystem', 'id'))
      .where(new Column('CodeSystem', 'lastUpdated'), '<', before)
      .execute(client);

    // Delete Coding_Property entries with a join
    await new DeleteQuery('Coding_Property')
      .using('CodeSystem', 'Coding')
      .where(new Column('Coding_Property', 'coding'), '=', new Column('Coding', 'id'))
      .where(new Column('Coding', 'system'), '=', new Column('CodeSystem', 'id'))
      .where(new Column('CodeSystem', 'lastUpdated'), '<', before)
      .execute(client);

    // Delete Coding entries
    await new DeleteQuery('Coding')
      .using('CodeSystem')
      .where(new Column('Coding', 'system'), '=', new Column('CodeSystem', 'id'))
      .where(new Column('CodeSystem', 'lastUpdated'), '<', before)
      .execute(client);
  }

  private getCodeSystemElements(codeSystem: CodeSystem): { concepts: Coding[]; properties: ImportedProperty[] } {
    const result = { concepts: [], properties: [] };
    if (codeSystem.concept) {
      for (const concept of codeSystem.concept) {
        this.addCodeSystemConcepts(codeSystem, concept, result);
      }
    }
    return result;
  }

  /**
   * Recursively adds CodeSystem concepts.
   * See: https://www.hl7.org/fhir/codesystem-definitions.html#CodeSystem.concept
   * @param codeSystem - The CodeSystem.
   * @param concept - The CodeSystem concept.
   * @param result - The results.
   * @param result.concepts - Concepts defined by the CodeSystem.
   * @param result.properties - Coding properties specified by the CodeSystem.
   */
  private addCodeSystemConcepts(
    codeSystem: CodeSystem,
    concept: CodeSystemConcept,
    result: { concepts: Coding[]; properties: ImportedProperty[] }
  ): void {
    const { code, display } = concept;
    result.concepts = append(result.concepts, { code, display });

    if (concept.property) {
      for (const prop of concept.property) {
        result.properties = append(result.properties, { code, property: prop.code, value: getPropertyValue(prop) });
      }
    }

    if (concept.concept) {
      for (const child of concept.concept) {
        this.addCodeSystemConcepts(codeSystem, child, result);
        result.properties = append(result.properties, {
          code: child.code,
          property:
            codeSystem.property?.find((p) => p.uri === parentProperty)?.code ?? codeSystem.hierarchyMeaning ?? 'parent',
          value: code,
        });
      }
    }
  }
}

function getPropertyValue(prop: CodeSystemConceptProperty): string {
  if (prop.valueBoolean !== undefined) {
    return prop.valueBoolean ? 'true' : 'false';
  } else if (prop.valueCode) {
    return prop.valueCode;
  } else if (prop.valueString) {
    return prop.valueString;
  }
  return '';
}
