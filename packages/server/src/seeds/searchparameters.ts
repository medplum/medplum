import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { BundleEntry, SearchParameter } from '@medplum/fhirtypes';
import { getDatabasePool } from '../database';
import { Repository, getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { r4ProjectId } from '../seed';
import { RebuildOptions, buildRebuildOptions } from './common';

/**
 * Creates all SearchParameter resources.
 * @param options - Optional options for how rebuild should be done.
 */
export async function rebuildR4SearchParameters(options?: Partial<RebuildOptions>): Promise<void> {
  const rebuildOptions = buildRebuildOptions(options);
  const client = getDatabasePool();
  await client.query('DELETE FROM "SearchParameter" WHERE "projectId" = $1', [r4ProjectId]);

  const systemRepo = getSystemRepo();

  const promises = [];
  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    for (const entry of readJson(filename).entry as BundleEntry[]) {
      promises.push(createParameter(systemRepo, entry.resource as SearchParameter));
    }
  }

  if (rebuildOptions.parallel) {
    await Promise.all(promises);
  } else {
    for (const promise of promises) {
      await promise;
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
