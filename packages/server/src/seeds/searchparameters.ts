// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { BundleEntry, SearchParameter } from '@medplum/fhirtypes';
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
