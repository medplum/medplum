import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Project, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { getClient } from '../database';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';

/**
 * Creates all StructureDefinition resources.
 *
 * @param project The project in which to create the StructureDefinition resources
 */
export async function rebuildR4StructureDefinitions(project: Project): Promise<void> {
  const client = getClient();
  await client.query(`DELETE FROM "StructureDefinition" WHERE "projectId" = $1`, [project.id]);
  await createStructureDefinitionsForBundle(readJson('fhir/r4/profiles-resources.json') as Bundle, project);
  await createStructureDefinitionsForBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle, project);
  await createStructureDefinitionsForBundle(readJson('fhir/r4/profiles-others.json') as Bundle, project);
}

async function createStructureDefinitionsForBundle(structureDefinitions: Bundle, project: Project): Promise<void> {
  for (const entry of structureDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;

    if (resource.resourceType === 'StructureDefinition' && resource.name) {
      logger.debug('StructureDefinition: ' + resource.name);
      const result = await systemRepo.createResource<StructureDefinition>({
        ...resource,
        meta: { ...resource.meta, project: project.id },
        text: undefined,
        differential: undefined,
      });
      logger.debug('Created: ' + result.id);
    }
  }
}
