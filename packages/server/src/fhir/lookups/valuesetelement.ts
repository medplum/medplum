import { CodeSystem, CodeSystemConcept, Resource, ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { LookupTable } from './lookuptable';

/**
 * The ValueSetElementTable class is used to index and search ValueSet $expand values.
 * Each element is represented as a separate row in the "ValueSetElementTable" table.
 * Elements can be found in ValueSet and CodeSystem resources.
 */
export class ValueSetElementTable extends LookupTable<ValueSetExpansionContains> {
  getTableName(): string {
    return 'ValueSetElement';
  }

  getColumnName(code: string): string {
    return code;
  }

  /**
   * Returns false, because the ValueSetElement table is never used for normal SearchParameter search.
   * ValueSetElement is only used for the $expand operation.
   * @returns Always false.
   */
  isIndexed(): boolean {
    return false;
  }

  async indexResource(client: PoolClient, resource: Resource): Promise<void> {
    const resourceType = resource.resourceType;
    const resourceId = resource.id as string;
    let elements: ValueSetExpansionContains[] | undefined = undefined;

    if (resourceType === 'ValueSet') {
      elements = this.getValueSetElements(resource as ValueSet);
    } else if (resourceType === 'CodeSystem') {
      elements = this.getCodeSystemElements(resource as CodeSystem);
    }

    if (!elements || elements.length === 0) {
      return;
    }

    await this.deleteValuesForResource(client, resource);

    const values = [];

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      values.push({
        id: randomUUID(),
        resourceId,
        index: i,
        system: element.system,
        code: element.code,
        display: element.display,
      });
    }

    await this.insertValuesForResource(client, resourceType, values);
  }

  private getValueSetElements(valueSet: ValueSet): ValueSetExpansionContains[] {
    const result = [];
    if (valueSet.compose?.include) {
      for (const include of valueSet.compose.include) {
        if (include.concept) {
          for (const concept of include.concept) {
            result.push({
              system: include.system,
              code: concept.code,
              display: concept.display,
            });
          }
        }
      }
    }
    return result;
  }

  private getCodeSystemElements(codeSystem: CodeSystem): ValueSetExpansionContains[] {
    const result: ValueSetExpansionContains[] = [];

    if (codeSystem.concept) {
      for (const concept of codeSystem.concept) {
        this.buildCodeSystemElements(codeSystem, concept, result);
      }
    }
    return result;
  }

  /**
   * Recursively adds CodeSystem concepts.
   * See: https://www.hl7.org/fhir/codesystem-definitions.html#CodeSystem.concept
   * @param concept The CodeSystem concept.
   */
  private buildCodeSystemElements(
    codeSystem: CodeSystem,
    concept: CodeSystemConcept,
    result: ValueSetExpansionContains[]
  ): void {
    if (concept.code && concept.display) {
      result.push({
        system: codeSystem.url as string,
        code: concept.code,
        display: concept.display,
      });
    }
    if (concept.concept) {
      for (const child of concept.concept) {
        this.buildCodeSystemElements(codeSystem, child, result);
      }
    }
  }
}
