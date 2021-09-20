import { Bundle, BundleEntry, CodeSystem, CodeSystemConcept, ValueSet } from '@medplum/core';
import { readJson } from '@medplum/definitions';
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

  for (const entry of bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
    const resource = entry.resource;
    if (resource?.resourceType === 'CodeSystem') {
      await importCodeSystem(client, resource);
    } else if (resource?.resourceType === 'ValueSet') {
      await importValueSet(client, resource);
    }
  }

  await importSnomed(client);
}

/**
 * Imports all value set elements from a CodeSystem.
 * See: https://www.hl7.org/fhir/codesystem.html
 * @param client The database client.
 * @param codeSystem The FHIR CodeSystem resource.
 */
async function importCodeSystem(client: Pool, codeSystem: CodeSystem): Promise<void> {
  if (!codeSystem.valueSet || !codeSystem.concept) {
    return;
  }
  for (const concept of codeSystem.concept) {
    importCodeSystemConcept(client, codeSystem.valueSet, concept);
  }
}

/**
 * Recursively imports CodeSystem concepts.
 * See: https://www.hl7.org/fhir/codesystem-definitions.html#CodeSystem.concept
 * @param client The database client.
 * @param system The ValueSet system.
 * @param concept The CodeSystem concept.
 */
async function importCodeSystemConcept(client: Pool, system: string, concept: CodeSystemConcept): Promise<void> {
  if (concept.code && concept.display) {
    await insertValueSetElement(client, system, concept.code, concept.display);
  }
  if (concept.concept) {
    for (const child of concept.concept) {
      await importCodeSystemConcept(client, system, child);
    }
  }
}

/**
 * Imports all value set elements from a ValueSet.
 * See: https://www.hl7.org/fhir/valueset.html
 * @param client The database client.
 * @param valueSet The FHIR ValueSet resource.
 */
async function importValueSet(client: Pool, valueSet: ValueSet): Promise<void> {
  if (!valueSet.url || !valueSet.compose?.include) {
    return;
  }
  for (const include of valueSet.compose.include) {
    if (!include.system || !include.concept) {
      continue;
    }
    for (const concept of include.concept) {
      if (concept.code && concept.display) {
        await insertValueSetElement(client, include.system, concept.code, concept.display);
      }
    }
  }
}

async function importSnomed(client: Pool): Promise<void> {
  const system = 'https://snomed.info/sct';

  const values = [
    { id: '316791000119102', name: 'Pain in left knee' },
    { id: '316931000119104', name: 'Pain in right knee' },
    { id: '287045000', name: 'Pain in left arm' },
    { id: '287046004', name: 'Pain in right arm' }
  ];

  for (const value of values) {
    await insertValueSetElement(client, system, value.id, value.name);
  }
}

async function insertValueSetElement(client: Pool, system: string, code: string, display: string): Promise<void> {
  new InsertQuery('ValueSetElement', {
    id: randomUUID(),
    system,
    code,
    display
  }).execute(client);
}
