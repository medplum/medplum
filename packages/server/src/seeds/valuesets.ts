import { Operator, WithId } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, CodeSystem, Resource, ValueSet } from '@medplum/fhirtypes';
import { r4ProjectId } from '../constants';
import { Repository } from '../fhir/repo';
import { getDbClientFromRepo } from './utils';

/**
 * Imports all built-in ValueSets and CodeSystems into the database.
 * @param systemRepo - The system repository to use
 * @param firstBoot - Whether this is the first boot of the server
 */
export async function rebuildR4ValueSets(systemRepo: Repository, firstBoot = false): Promise<void> {
  const files = [
    'v2-tables.json',
    'v3-codesystems.json',
    'valuesets.json',
    'valuesets-medplum.json',
    'valuesets-medplum-generated.json',
  ];
  for (const file of files) {
    const bundle = readJson('fhir/r4/' + file) as Bundle<CodeSystem | ValueSet>;
    const codeSystems: WithId<CodeSystem>[] = [];
    const valueSets: WithId<ValueSet>[] = [];
    for (const entry of bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
      const resource = entry.resource as CodeSystem | ValueSet;
      if (!firstBoot) {
        await deleteExisting(systemRepo, resource, r4ProjectId);
      }
      const cleanResource = {
        ...resource,
        meta: {
          ...resource.meta,
          project: r4ProjectId,
          lastUpdated: new Date().toISOString(),
          versionId: systemRepo.generateId(),
          author: {
            reference: 'system',
          },
        },
        id: systemRepo.generateId(),
      };
      if (cleanResource.resourceType === 'CodeSystem') {
        codeSystems.push(cleanResource);
      } else if (cleanResource.resourceType === 'ValueSet') {
        valueSets.push(cleanResource);
      } else {
        throw new Error(
          `Invalid resource of type '${(cleanResource as Resource).resourceType ?? 'undefined'}' in '${file}'. Only CodeSystem or ValueSet resources are allowed in this file`
        );
      }
    }

    const [dbClient, cleanupDbClient] = await getDbClientFromRepo(systemRepo);
    await systemRepo.reindexResources(dbClient, codeSystems);
    await systemRepo.reindexResources(dbClient, valueSets);
    cleanupDbClient();
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
      const existing = entry.resource as WithId<CodeSystem | ValueSet>;
      await systemRepo.deleteResource(existing.resourceType, existing.id);
    }
  }
}
