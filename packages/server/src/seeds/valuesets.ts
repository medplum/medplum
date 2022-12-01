import { readJson } from '@medplum/definitions';
import {
  Bundle,
  BundleEntry,
  CodeSystem,
  CodeSystemConcept,
  ValueSet,
  ValueSetComposeInclude,
  ValueSetComposeIncludeConcept,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { getClient } from '../database';
import { InsertQuery } from '../fhir/sql';

/**
 * Creates test ValueSetElement rows.
 */
export async function createValueSetElements(): Promise<void> {
  const client = getClient();
  await client.query('DELETE FROM "ValueSetElement"');

  const bundle = readJson('fhir/r4/valuesets.json') as Bundle<CodeSystem | ValueSet>;

  await new ValueSystemImporter(client, bundle).importValueSetElements();
}

class ValueSystemImporter {
  constructor(private client: Pool, private bundle: Bundle<CodeSystem | ValueSet>) {}

  async importValueSetElements(): Promise<void> {
    for (const entry of this.bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
      const resource = entry.resource;
      if (resource) {
        await this.#importResource(resource);
      }
    }

    await this.#importSnomed();
  }

  async #importResource(resource: CodeSystem | ValueSet): Promise<void> {
    if (resource?.resourceType === 'ValueSet') {
      await this.#importValueSet(resource);
    }
  }

  /**
   * Imports all value set elements from a CodeSystem.
   * See: https://www.hl7.org/fhir/codesystem.html
   * @param valueSet The ValueSet URL.
   * @param codeSystem The FHIR CodeSystem resource.
   */
  async #importCodeSystemAs(valueSet: string, codeSystem: CodeSystem): Promise<void> {
    if (codeSystem.concept) {
      for (const concept of codeSystem.concept) {
        await this.#importCodeSystemConcept(valueSet, codeSystem, concept);
      }
    }
  }

  /**
   * Recursively imports CodeSystem concepts.
   * See: https://www.hl7.org/fhir/codesystem-definitions.html#CodeSystem.concept
   * @param valueSet The ValueSet URL.
   * @param concept The CodeSystem concept.
   */
  async #importCodeSystemConcept(valueSet: string, codeSystem: CodeSystem, concept: CodeSystemConcept): Promise<void> {
    if (concept.code && concept.display) {
      await this.#insertValueSetElement(valueSet, codeSystem.url as string, concept.code, concept.display);
    }
    if (concept.concept) {
      for (const child of concept.concept) {
        await this.#importCodeSystemConcept(valueSet, codeSystem, child);
      }
    }
  }

  /**
   * Imports all value set elements from a ValueSet.
   * See: https://www.hl7.org/fhir/valueset.html
   * @param valueSet The FHIR ValueSet resource.
   */
  async #importValueSet(valueSet: ValueSet): Promise<void> {
    if (valueSet.url && valueSet.compose?.include) {
      for (const include of valueSet.compose.include) {
        await this.#importValueSetInclude(valueSet.url, include);
      }
    }
  }

  /**
   * Imports one set of ValueSet included elements.
   * @param valueSet The ValueSet URL.
   * @param include The included codes or system references.
   */
  async #importValueSetInclude(valueSet: string, include: ValueSetComposeInclude): Promise<void> {
    if (include.concept) {
      await this.#importValueSetConcepts(valueSet, include.system || valueSet, include.concept);
    }
    if (include.system) {
      const includedResource = this.#getByUrl(include.system);
      if (includedResource) {
        await this.#importCodeSystemAs(valueSet, includedResource);
      }
    }
  }

  /**
   * Imports a collection of ValueSet concepts into the system.
   * @param valueSet The ValueSet URL.
   * @param system The concept system.
   * @param concepts The included concepts.
   */
  async #importValueSetConcepts(
    valueSet: string,
    system: string,
    concepts: ValueSetComposeIncludeConcept[]
  ): Promise<void> {
    for (const concept of concepts) {
      if (concept.code && concept.display) {
        await this.#insertValueSetElement(valueSet, system, concept.code, concept.display);
      }
    }
  }

  #getByUrl(url: string): CodeSystem | undefined {
    for (const entry of this.bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
      const resource = entry.resource;
      if (resource?.resourceType === 'CodeSystem' && resource?.url === url) {
        return resource;
      }
    }
    return undefined;
  }

  async #importSnomed(): Promise<void> {
    const system = 'https://snomed.info/sct';

    const values = [
      { id: '316791000119102', name: 'Pain in left knee' },
      { id: '316931000119104', name: 'Pain in right knee' },
      { id: '287045000', name: 'Pain in left arm' },
      { id: '287046004', name: 'Pain in right arm' },
    ];

    for (const value of values) {
      await this.#insertValueSetElement(system, system, value.id, value.name);
    }
  }

  async #insertValueSetElement(valueSet: string, system: string, code: string, display: string): Promise<void> {
    await new InsertQuery('ValueSetElement', [
      {
        id: randomUUID(),
        valueSet,
        system,
        code,
        display,
      },
    ]).execute(this.client);
  }
}
