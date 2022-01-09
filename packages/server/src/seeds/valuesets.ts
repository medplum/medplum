import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, CodeSystem, CodeSystemConcept, ValueSet } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { getClient } from '../database';
import { InsertQuery } from '../fhir/sql';

/**
 * Creates test ValueSetElement rows.
 */
export async function createValueSetElements(): Promise<void> {
  const client = getClient();
  client.query('DELETE FROM "ValueSetElement"');

  const bundle = readJson('fhir/r4/valuesets.json') as Bundle<CodeSystem | ValueSet>;

  new ValueSystemImporter(client, bundle).importValueSetEleemnts();
}

class ValueSystemImporter {
  constructor(private client: Pool, private bundle: Bundle<CodeSystem | ValueSet>) {}

  async importValueSetEleemnts(): Promise<void> {
    for (const entry of this.bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
      const resource = entry.resource;
      if (resource) {
        this.importResource(resource);
      }
    }

    await this.importSnomed();
  }

  private async importResource(resource: CodeSystem | ValueSet): Promise<void> {
    if (resource?.resourceType === 'CodeSystem') {
      await this.importCodeSystem(resource);
    } else if (resource?.resourceType === 'ValueSet') {
      await this.importValueSet(resource);
    }
  }

  /**
   * Imports all value set elements from a CodeSystem.
   * See: https://www.hl7.org/fhir/codesystem.html
   * @param codeSystem The FHIR CodeSystem resource.
   */
  private async importCodeSystem(codeSystem: CodeSystem): Promise<void> {
    if (codeSystem.valueSet) {
      this.importCodeSystemAs(codeSystem, codeSystem.valueSet);
    }
  }

  /**
   * Imports all value set elements from a CodeSystem.
   * See: https://www.hl7.org/fhir/codesystem.html
   * @param codeSystem The FHIR CodeSystem resource.
   * @param system The ValueSet system.
   */
  private async importCodeSystemAs(codeSystem: CodeSystem, system: string): Promise<void> {
    if (codeSystem.concept) {
      for (const concept of codeSystem.concept) {
        this.importCodeSystemConcept(system, concept);
      }
    }
  }

  /**
   * Recursively imports CodeSystem concepts.
   * See: https://www.hl7.org/fhir/codesystem-definitions.html#CodeSystem.concept
   * @param system The ValueSet system.
   * @param concept The CodeSystem concept.
   */
  private async importCodeSystemConcept(system: string, concept: CodeSystemConcept): Promise<void> {
    if (concept.code && concept.display) {
      await this.insertValueSetElement(system, concept.code, concept.display);
    }
    if (concept.concept) {
      for (const child of concept.concept) {
        await this.importCodeSystemConcept(system, child);
      }
    }
  }

  /**
   * Imports all value set elements from a ValueSet.
   * See: https://www.hl7.org/fhir/valueset.html
   * @param valueSet The FHIR ValueSet resource.
   */
  private async importValueSet(valueSet: ValueSet): Promise<void> {
    if (!valueSet.url || !valueSet.compose?.include) {
      return;
    }
    for (const include of valueSet.compose.include) {
      if (include.concept) {
        for (const concept of include.concept) {
          if (concept.code && concept.display) {
            await this.insertValueSetElement(valueSet.url, concept.code, concept.display);
          }
        }
      } else if (include.system) {
        const includedResource = this.getByUrl(include.system);
        if (includedResource) {
          this.importCodeSystemAs(includedResource, valueSet.url);
        }
      }
    }
  }

  private getByUrl(url: string): CodeSystem | undefined {
    for (const entry of this.bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
      const resource = entry.resource;
      if (resource?.resourceType === 'CodeSystem' && resource?.url === url) {
        return resource;
      }
    }
    return undefined;
  }

  private async importSnomed(): Promise<void> {
    const system = 'https://snomed.info/sct';

    const values = [
      { id: '316791000119102', name: 'Pain in left knee' },
      { id: '316931000119104', name: 'Pain in right knee' },
      { id: '287045000', name: 'Pain in left arm' },
      { id: '287046004', name: 'Pain in right arm' },
    ];

    for (const value of values) {
      await this.insertValueSetElement(system, value.id, value.name);
    }
  }

  private async insertValueSetElement(system: string, code: string, display: string): Promise<void> {
    new InsertQuery('ValueSetElement', {
      id: randomUUID(),
      system,
      code,
      display,
    }).execute(this.client);
  }
}
