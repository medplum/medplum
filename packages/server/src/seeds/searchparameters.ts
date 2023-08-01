import { readJson } from '@medplum/definitions';
import { BundleEntry, Project, SearchParameter } from '@medplum/fhirtypes';
import { getClient } from '../database';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';

/**
 * Creates all SearchParameter resources.
 *
 * @param project The project in which to create the SearchParameter resources
 */
export async function createSearchParameters(project: Project): Promise<void> {
  const client = getClient();
  await client.query('DELETE FROM "SearchParameter"');

  for (const entry of readJson('fhir/r4/search-parameters.json').entry as BundleEntry[]) {
    await createParameter(entry.resource as SearchParameter, project);
  }
  for (const entry of readJson('fhir/r4/search-parameters-medplum.json').entry as BundleEntry[]) {
    await createParameter(entry.resource as SearchParameter, project);
  }
}

async function createParameter(param: SearchParameter, project: Project): Promise<void> {
  logger.debug('SearchParameter: ' + param.name);
  await systemRepo.createResource<SearchParameter>({
    ...param,
    meta: { ...param.meta, project: project.id },
    text: undefined,
  });
}
