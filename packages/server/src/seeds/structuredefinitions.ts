import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { getDatabasePool } from '../database';
import { Repository, getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { r4ProjectId } from '../seed';

/**
 * Creates all StructureDefinition resources.
 */
export async function rebuildR4StructureDefinitions(): Promise<void> {
  const client = getDatabasePool();
  await client.query(`DELETE FROM "StructureDefinition" WHERE "projectId" = $1`, [r4ProjectId]);

  const systemRepo = getSystemRepo();
  await Promise.all([
    createStructureDefinitionsForBundle(systemRepo, readJson('fhir/r4/profiles-resources.json') as Bundle),
    createStructureDefinitionsForBundle(systemRepo, readJson('fhir/r4/profiles-medplum.json') as Bundle),
    createStructureDefinitionsForBundle(systemRepo, readJson('fhir/r4/profiles-others.json') as Bundle),
  ]);
}

async function createStructureDefinitionsForBundle(
  systemRepo: Repository,
  structureDefinitions: Bundle
): Promise<void> {
  const promises = [];
  for (const entry of structureDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'StructureDefinition' && resource.name) {
      promises.push(createAndLogStructureDefinition(systemRepo, resource));
    }
  }
  await Promise.all(promises);
}

async function createAndLogStructureDefinition(systemRepo: Repository, resource: StructureDefinition): Promise<void> {
  globalLogger.debug('[StructureDefinition] creation started: ' + resource.name);
  const result = await systemRepo.createResource<StructureDefinition>({
    ...resource,
    meta: {
      ...resource.meta,
      project: r4ProjectId,
      lastUpdated: undefined,
      versionId: undefined,
    },
    text: undefined,
    differential: undefined,
  });
  globalLogger.debug(`[StructureDefinition] creation finished: ${result.name} - ID: ${result.id}`);
}
