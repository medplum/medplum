import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { getClient } from '../database';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { r4ProjectId } from '../seed';

/**
 * Creates all StructureDefinition resources.
 */
export async function rebuildR4StructureDefinitions(): Promise<void> {
  const client = getClient();
  await client.query(`DELETE FROM "StructureDefinition" WHERE "projectId" = $1`, [r4ProjectId]);
  await createStructureDefinitionsForBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  await createStructureDefinitionsForBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
  await createStructureDefinitionsForBundle(readJson('fhir/r4/profiles-others.json') as Bundle);
}

async function createStructureDefinitionsForBundle(structureDefinitions: Bundle): Promise<void> {
  for (const entry of structureDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;

    if (resource.resourceType === 'StructureDefinition' && resource.name) {
      logger.debug('StructureDefinition: ' + resource.name);
      const result = await systemRepo.createResource<StructureDefinition>({
        ...resource,
        meta: { ...resource.meta, project: r4ProjectId },
        text: undefined,
        differential: undefined,
      });
      logger.debug('Created: ' + result.id);
    }
  }
}
