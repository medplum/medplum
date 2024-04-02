import { append } from '@medplum/core';
import { ImportedProperty, importCodeSystem } from '../operations/codesystemimport';
import { CodeSystem, CodeSystemConcept, CodeSystemConceptProperty, Coding, Resource } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { parentProperty } from '../operations/utils/terminology';
import { DeleteQuery } from '../sql';
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

  async indexResource(client: PoolClient, resource: Resource, create: boolean): Promise<void> {
    if (resource.resourceType === 'CodeSystem' && (resource.content === 'complete' || resource.content === 'example')) {
      if (!create) {
        await this.deleteValuesForResource(client, resource);
      }

      const elements = this.getCodeSystemElements(resource);
      await importCodeSystem(client, resource, elements.concepts, elements.properties);
    }
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client - The database client.
   * @param resource - The resource to delete.
   */
  async deleteValuesForResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    const deletedCodes = await new DeleteQuery('Coding')
      .where('system', '=', resource.id)
      .returnColumn('id')
      .execute(client);
    await new DeleteQuery('CodeSystem_Property').where('system', '=', resource.id).execute(client);
    if (deletedCodes.length) {
      for (let i = 0; i < deletedCodes.length; i += 500) {
        await new DeleteQuery('Coding_Property')
          .where(
            'coding',
            'IN',
            deletedCodes.slice(i, i + 500).map((c) => c.id)
          )
          .execute(client);
      }
    }
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
