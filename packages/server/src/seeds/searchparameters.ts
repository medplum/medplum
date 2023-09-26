import { readJson } from '@medplum/definitions';
import { BundleEntry, SearchParameter } from '@medplum/fhirtypes';
import { getClient } from '../database';
import { systemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { r4ProjectId } from '.';

/**
 * Creates all SearchParameter resources.
 */
export async function rebuildR4SearchParameters(): Promise<void> {
  const client = getClient();
  await client.query('DELETE FROM "SearchParameter" WHERE "projectId" = $1', [r4ProjectId]);

  for (const entry of readJson('fhir/r4/search-parameters.json').entry as BundleEntry[]) {
    await createParameter(entry.resource as SearchParameter);
  }
  for (const entry of readJson('fhir/r4/search-parameters-medplum.json').entry as BundleEntry[]) {
    await createParameter(entry.resource as SearchParameter);
  }
}

async function createParameter(param: SearchParameter): Promise<void> {
  globalLogger.debug('SearchParameter: ' + param.name);
  await systemRepo.createResource<SearchParameter>({
    ...param,
    meta: { ...param.meta, project: r4ProjectId },
    text: undefined,
  });
}
