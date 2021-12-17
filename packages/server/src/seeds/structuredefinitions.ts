import { isOk, OperationOutcomeError } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { getClient } from '../database';
import { repo } from '../fhir';
import { logger } from '../logger';

/**
 * Creates all StructureDefinition resources.
 */
export async function createStructureDefinitions(): Promise<void> {
  const client = getClient();
  client.query('DELETE FROM "StructureDefinition"');
  await createStructureDefinitionsForBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  await createStructureDefinitionsForBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
}

async function createStructureDefinitionsForBundle(structureDefinitions: Bundle): Promise<void> {
  for (const entry of structureDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;

    if (resource.resourceType === 'StructureDefinition' && resource.name) {
      logger.debug('StructureDefinition: ' + resource.name);
      const [outcome, result] = await repo.createResource<StructureDefinition>({
        ...resource,
        text: undefined,
      });

      if (!isOk(outcome)) {
        throw new OperationOutcomeError(outcome);
      }

      logger.debug('Created: ' + (result as StructureDefinition).id);
    }
  }
}
