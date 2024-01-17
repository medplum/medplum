import { CodeSystem, CodeSystemConcept, Coding, Resource } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { LookupTable } from './lookuptable';
import { DeleteQuery } from '../sql';
import { append } from '@medplum/core';
import { ImportedProperty, importCodeSystem } from '../operations/codesystemimport';

/**
 * The CodingTable class is used to index and search Coding values associated with a CodeSystem.
 * Each system/code/display triple is represented as a separate row in the "Coding" table.
 */
export class CodingTable extends LookupTable<Coding> {
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

  async indexResource(client: PoolClient, resource: Resource): Promise<void> {
    if (resource.resourceType === 'CodeSystem' && resource.content === 'complete') {
      await this.deleteValuesForResource(client, resource);

      const elements = this.getCodeSystemElements(resource);
      await importCodeSystem(resource as CodeSystem, elements.concepts, elements.properties);
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
      await new DeleteQuery('Coding_Property')
        .where(
          'coding',
          'IN',
          deletedCodes.map((c) => c.id)
        )
        .execute(client);
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
    if (concept.concept) {
      for (const child of concept.concept) {
        this.addCodeSystemConcepts(codeSystem, child, result);
        result.properties = append(result.properties, {
          code: child.code as string,
          property: codeSystem.hierarchyMeaning ?? 'parent',
          value: code as string,
        });
      }
    }
  }
}
