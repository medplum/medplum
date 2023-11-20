import { Operator } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, CodeSystem, ValueSet } from '@medplum/fhirtypes';
import { systemRepo } from '../fhir/repo';
import { r4ProjectId } from '../seed';

/**
 * Imports all built-in ValueSets and CodeSystems into the database.
 */
export async function rebuildR4ValueSets(): Promise<void> {
  const files = ['valuesets.json', 'v3-codesystems.json', 'valuesets-medplum.json', 'valuesets-uscore.json'];
  for (const file of files) {
    const bundle = readJson('fhir/r4/' + file) as Bundle<CodeSystem | ValueSet>;
    for (const entry of bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
      const resource = entry.resource as CodeSystem | ValueSet;
      await deleteExisting(resource);
      await systemRepo.createResource({
        ...resource,
        meta: { ...resource.meta, project: r4ProjectId },
      });
    }
  }
}

async function deleteExisting(resource: CodeSystem | ValueSet): Promise<void> {
  const bundle = await systemRepo.search({
    resourceType: resource.resourceType,
    filters: [{ code: 'url', operator: Operator.EQUALS, value: resource.url as string }],
  });
  if (bundle.entry && bundle.entry.length > 0) {
    for (const entry of bundle.entry) {
      const existing = entry.resource as CodeSystem | ValueSet;
      await systemRepo.deleteResource(existing.resourceType, existing.id as string);
    }
  }
}
