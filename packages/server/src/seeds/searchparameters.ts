// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isResource } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, processBaseDefinitions } from '@medplum/definitions';
import type { SearchParameter } from '@medplum/fhirtypes';
import { r4ProjectId } from '../constants';
import { DatabaseMode } from '../database';
import type { Repository } from '../fhir/repo';
import { globalLogger } from '../logger';

/**
 * Creates all SearchParameter resources.
 * @param systemRepo - The system repository to use
 */
export async function rebuildR4SearchParameters(systemRepo: Repository): Promise<void> {
  const client = systemRepo.getDatabaseClient(DatabaseMode.WRITER);
  await client.query('DELETE FROM "SearchParameter" WHERE "projectId" = $1', [r4ProjectId]);
  await processBaseDefinitions(SEARCH_PARAMETER_BUNDLE_FILES, async (entry) => {
    if (!isResource<SearchParameter>(entry.resource, 'SearchParameter')) {
      return;
    }

    const param = entry.resource;
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
  });
}
