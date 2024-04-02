import { Operator } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, CodeSystem, ValueSet } from '@medplum/fhirtypes';
import { Repository, getSystemRepo } from '../fhir/repo';
import { r4ProjectId } from '../seed';

/**
 * Imports all built-in ValueSets and CodeSystems into the database.
 */
export async function rebuildR4ValueSets(): Promise<void> {
  const systemRepo = getSystemRepo();
  const files = ['v2-tables.json', 'v3-codesystems.json', 'valuesets.json', 'valuesets-medplum.json'];
  for (const file of files) {
    const bundle = readJson('fhir/r4/' + file) as Bundle<CodeSystem | ValueSet>;
    for (const entry of bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
      const resource = entry.resource as CodeSystem | ValueSet;
      await deleteExisting(systemRepo, resource, r4ProjectId);
      await systemRepo.createResource({
        ...resource,
        meta: {
          ...resource.meta,
          project: r4ProjectId,
          lastUpdated: undefined,
          versionId: undefined,
        },
      });
    }
  }
}

async function deleteExisting(
  systemRepo: Repository,
  resource: CodeSystem | ValueSet,
  projectId: string
): Promise<void> {
  const bundle = await systemRepo.search({
    resourceType: resource.resourceType,
    filters: [
      { code: 'url', operator: Operator.EQUALS, value: resource.url as string },
      { code: '_project', operator: Operator.EQUALS, value: projectId },
    ],
  });
  if (bundle.entry && bundle.entry.length > 0) {
    for (const entry of bundle.entry) {
      const existing = entry.resource as CodeSystem | ValueSet;
      await systemRepo.deleteResource(existing.resourceType, existing.id as string);
    }
  }
}
