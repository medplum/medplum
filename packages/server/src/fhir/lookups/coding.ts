// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { append } from '@medplum/core';
import type {
  CodeSystem,
  CodeSystemConcept,
  CodeSystemConceptProperty,
  Coding,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import type { Pool, PoolClient } from 'pg';
import type { ImportedProperty } from '../operations/codesystemimport';
import { importCodeSystem } from '../operations/codesystemimport';
import { parentProperty } from '../operations/utils/terminology';
import { Column, Condition, Conjunction } from '../sql';
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
  async purgeValuesBefore(client: Pool | PoolClient, resourceType: ResourceType, before: string): Promise<void> {
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
