import { Bundle, BundleEntry, isOk, OperationOutcomeError, Resource, StructureDefinition } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { getClient } from '../database';
import { repo } from '../fhir';
import { logger } from '../logger';

/**
 * Creates all StructureDefinition resources.
 */
export async function createStructureDefinitions(): Promise<void> {
  const client = getClient();
  client.query('DELETE FROM "StructureDefinition"');

  const structureDefinitions = readJson('fhir/r4/profiles-resources.json') as Bundle;
  for (const entry of (structureDefinitions.entry as BundleEntry[])) {
    const resource = entry.resource as Resource;

    if (resource.resourceType === 'StructureDefinition' && resource.name) {
      logger.debug('StructureDefinition: ' + resource.name);
      const [outcome, result] = await repo.createResource<StructureDefinition>({
        ...resource,
        text: undefined
      });

      if (!isOk(outcome)) {
        throw new OperationOutcomeError(outcome);
      }

      logger.debug('Created: ' + (result as StructureDefinition).id);
    }
  }
}
