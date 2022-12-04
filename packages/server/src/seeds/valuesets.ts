import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, CodeSystem, ValueSet } from '@medplum/fhirtypes';
import { systemRepo } from '../fhir/repo';

/**
 * Imports all built-in ValueSets and CodeSystems into the database.
 */
export async function createValueSets(): Promise<void> {
  const bundle = readJson('fhir/r4/valuesets.json') as Bundle<CodeSystem | ValueSet>;
  for (const entry of bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
    const resource = entry.resource as CodeSystem | ValueSet;
    await systemRepo.createResource(resource);
  }
}
