import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { BundleEntry, SearchParameter } from '@medplum/fhirtypes';
import { DatabaseMode, getDatabasePool } from '../database';
import { Repository, getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { r4ProjectId } from '../seed';

/**
 * Creates all SearchParameter resources.
 */
export async function rebuildR4SearchParameters(): Promise<void> {
  const client = getDatabasePool(DatabaseMode.WRITER);
  await client.query('DELETE FROM "SearchParameter" WHERE "projectId" = $1', [r4ProjectId]);

  const systemRepo = getSystemRepo();

  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    for (const entry of readJson(filename).entry as BundleEntry[]) {
      await createParameter(systemRepo, entry.resource as SearchParameter);
    }
  }
}

async function createParameter(systemRepo: Repository, param: SearchParameter): Promise<void> {
  globalLogger.debug('SearchParameter: ' + param.name);
  await systemRepo.createResource<SearchParameter>({
    ...param,
    meta: {
      ...param.meta,
      project: r4ProjectId,
      lastUpdated: undefined,
      versionId: undefined,
    },
    text: undefined,
  });
}
