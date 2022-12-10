import { Operator } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, CodeSystem, ValueSet } from '@medplum/fhirtypes';
import { systemRepo } from '../fhir/repo';

/**
 * Imports all built-in ValueSets and CodeSystems into the database.
 */
export async function createValueSets(): Promise<void> {
  const files = ['valuesets.json', 'v3-codesystems.json'];
  for (const file of files) {
    const bundle = readJson('fhir/r4/' + file) as Bundle<CodeSystem | ValueSet>;
    for (const entry of bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
      const resource = entry.resource as CodeSystem | ValueSet;
      await deleteExisting(resource);
      await systemRepo.createResource(resource);
    }
  }
}

async function deleteExisting(resource: CodeSystem | ValueSet): Promise<void> {
  const bundle = await systemRepo.search({
    resourceType: resource.resourceType,
    count: 1,
    filters: [{ code: 'url', operator: Operator.EQUALS, value: resource.url as string }],
  });
  if (bundle.entry && bundle.entry.length > 0) {
    const existing = bundle.entry[0].resource as CodeSystem | ValueSet;
    await systemRepo.deleteResource(existing.resourceType, existing.id as string);
  }
}
