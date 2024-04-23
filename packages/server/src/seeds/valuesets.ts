import { Operator } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, CodeSystem, ValueSet } from '@medplum/fhirtypes';
import { Repository, getSystemRepo } from '../fhir/repo';
import { r4ProjectId } from '../seed';
import { RebuildOptions, buildRebuildOptions } from './common';

/**
 * Imports all built-in ValueSets and CodeSystems into the database.
 * @param options - Optional options for how rebuild should be done.
 */
export async function rebuildR4ValueSets(options?: Partial<RebuildOptions>): Promise<void> {
  const finalOptions = buildRebuildOptions(options);
  const systemRepo = getSystemRepo();
  const files = ['v2-tables.json', 'v3-codesystems.json', 'valuesets.json', 'valuesets-medplum.json'];
  for (const file of files) {
    const bundle = readJson('fhir/r4/' + file) as Bundle<CodeSystem | ValueSet>;
    if (finalOptions.parallel) {
      const promises = [];
      for (const entry of bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
        promises.push(overwriteResource(systemRepo, entry.resource as CodeSystem | ValueSet, finalOptions));
      }
      await Promise.all(promises);
    } else {
      for (const entry of bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
        await overwriteResource(systemRepo, entry.resource as CodeSystem | ValueSet, finalOptions);
      }
    }
  }
}

async function overwriteResource(
  systemRepo: Repository,
  resource: CodeSystem | ValueSet,
  options: RebuildOptions
): Promise<void> {
  await deleteExisting(systemRepo, resource, r4ProjectId, options);
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

async function deleteExisting(
  systemRepo: Repository,
  resource: CodeSystem | ValueSet,
  projectId: string,
  options: RebuildOptions
): Promise<void> {
  const bundle = await systemRepo.search({
    resourceType: resource.resourceType,
    filters: [
      { code: 'url', operator: Operator.EQUALS, value: resource.url as string },
      { code: '_project', operator: Operator.EQUALS, value: projectId },
    ],
  });
  if (bundle.entry && bundle.entry.length > 0) {
    if (options.parallel) {
      const promises = [];
      for (const entry of bundle.entry) {
        const existing = entry.resource as CodeSystem | ValueSet;
        promises.push(systemRepo.deleteResource(existing.resourceType, existing.id as string));
      }
      await Promise.all(promises);
    } else {
      for (const entry of bundle.entry) {
        const existing = entry.resource as CodeSystem | ValueSet;
        await systemRepo.deleteResource(existing.resourceType, existing.id as string);
      }
    }
  }
}
