import { WithId } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { BundleEntry, SearchParameter } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { r4ProjectId } from '../constants';
import { DatabaseMode } from '../database';
import { Repository } from '../fhir/repo';
import { globalLogger } from '../logger';

/**
 * Creates all SearchParameter resources.
 * @param systemRepo - The system repository to use
 */
export async function rebuildR4SearchParameters(systemRepo: Repository): Promise<void> {
  const client = systemRepo.getDatabaseClient(DatabaseMode.WRITER);
  await client.query('DELETE FROM "SearchParameter" WHERE "projectId" = $1', [r4ProjectId]);

  const searchParams: WithId<SearchParameter>[] = [];
  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    for (const entry of readJson(filename).entry as BundleEntry<SearchParameter>[]) {
      const param = entry.resource as SearchParameter;
      globalLogger.debug('SearchParameter: ' + param.name);
      const cleanParam = {
        ...param,
        meta: {
          ...param.meta,
          project: r4ProjectId,
          lastUpdated: new Date().toISOString(),
          versionId: systemRepo.generateId(),
          author: {
            reference: 'system',
          },
        },
        text: undefined,
        id: systemRepo.generateId(),
      };
      searchParams.push(cleanParam);
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
  await systemRepo.reindexResources(dbClient, searchParams);

  if (needToClose) {
    dbClient.release(true);
  }
}
