import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, SearchParameter } from '@medplum/fhirtypes';
import { getClient } from '../database';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';

/**
 * Creates all SearchParameter resources.
 */
export async function createSearchParameters(): Promise<void> {
  const client = getClient();
  await client.query('DELETE FROM "SearchParameter"');

  const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle;

  for (const entry of searchParams.entry as BundleEntry[]) {
    const searchParam = entry.resource as SearchParameter;

    logger.debug('SearchParameter: ' + searchParam.name);
    await systemRepo.createResource<SearchParameter>({
      ...searchParam,
      text: undefined,
    });
  }
}
