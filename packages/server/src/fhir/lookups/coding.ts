import { CodeSystem, CodeSystemConcept, Coding, Resource } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { LookupTable } from './lookuptable';
import { DeleteQuery } from '../sql';

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
    const resourceType = resource.resourceType;

    let elements: Coding[] | undefined = undefined;
    if (resourceType === 'CodeSystem' && resource.content === 'complete') {
      elements = this.getCodeSystemElements(resource);
    }
    if (!elements?.length) {
      return;
    }

    await this.deleteValuesForResource(client, resource);

    const values = [];
    for (const element of elements) {
      values.push({
        system: resource.id,
        code: element.code,
        display: element.display,
      });
    }

    await this.insertValuesForResource(client, resourceType, values);
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client - The database client.
   * @param resource - The resource to delete.
   */
  async deleteValuesForResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    await new DeleteQuery(this.getTableName()).where('system', '=', resource.id).execute(client);
  }

  private getCodeSystemElements(codeSystem: CodeSystem): Coding[] {
    const result: Coding[] = [];
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
   * @param result - The output value set concept array.
   */
  private addCodeSystemConcepts(codeSystem: CodeSystem, concept: CodeSystemConcept, result: Coding[]): void {
    if (concept.code && concept.display) {
      result.push({
        system: codeSystem.id,
        code: concept.code,
        display: concept.display,
      });
    }
    if (concept.concept) {
      for (const child of concept.concept) {
        this.addCodeSystemConcepts(codeSystem, child, result);
      }
    }
  }
}
