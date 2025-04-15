import { WithId } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { r4ProjectId } from '../constants';
import { DatabaseMode } from '../database';
import { Repository } from '../fhir/repo';
import { globalLogger } from '../logger';

/**
 * Creates all StructureDefinition resources.
 * @param systemRepo - The system repository to use
 */
export async function rebuildR4StructureDefinitions(systemRepo: Repository): Promise<void> {
  const client = systemRepo.getDatabaseClient(DatabaseMode.WRITER);
  await client.query(`DELETE FROM "StructureDefinition" WHERE "projectId" = $1`, [r4ProjectId]);

  await createStructureDefinitionsForBundle(systemRepo, readJson('fhir/r4/profiles-resources.json') as Bundle);
  await createStructureDefinitionsForBundle(systemRepo, readJson('fhir/r4/profiles-medplum.json') as Bundle);
  await createStructureDefinitionsForBundle(systemRepo, readJson('fhir/r4/profiles-others.json') as Bundle);
}

async function createStructureDefinitionsForBundle(
  systemRepo: Repository,
  structureDefinitions: Bundle
): Promise<void> {
  const sds: WithId<StructureDefinition>[] = [];
  for (const entry of structureDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;

    if (resource.resourceType === 'StructureDefinition' && resource.name) {
      globalLogger.debug('StructureDefinition: ' + resource.name);
      const structureDefinition = {
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
        text: undefined,
        differential: undefined,
        id: systemRepo.generateId(),
      };
      globalLogger.debug('Created: ' + structureDefinition.id);
    }
  }

  // Get a client
  const clientOrPool = systemRepo.getDatabaseClient(DatabaseMode.WRITER);
  let needToClose = false;
  let dbClient: PoolClient;

  if (clientOrPool instanceof Pool) {
    dbClient = await clientOrPool.connect();
    needToClose = true;
  } else {
    dbClient = clientOrPool;
  }

  // Write StructureDefinitions
  await systemRepo.reindexResources(dbClient, sds);

  if (needToClose) {
    dbClient.release(true);
  }
}
