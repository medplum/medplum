import { assertOk, Bundle, BundleEntry, createReference, Project, SearchParameter, User } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { registerNew } from './auth/register';
import { getConfig } from './config';
import { repo } from './fhir';
import { logger } from './logger';
import { createStructureDefinitions } from './seeds/structuredefinitions';
import { createValueSetElements } from './seeds/valuesets';

export async function seedDatabase(): Promise<void> {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

  const registerResponse = await registerNew({
    admin: true,
    firstName: 'Medplum',
    lastName: 'Admin',
    projectName: 'Medplum',
    email: 'admin@example.com',
    password: 'admin'
  });

  await repo.updateResource({
    ...registerResponse.client,
    redirectUri: getConfig().appBaseUrl
  });

  await createPublicProject(registerResponse.user);
  await createValueSetElements();
  await createSearchParameters();
  await createStructureDefinitions();
}

/**
 * Returns true if the database is already seeded.
 * @returns True if already seeded.
 */
async function isSeeded(): Promise<boolean> {
  const [outcome, bundle] = await repo.search({
    resourceType: 'User',
    count: 1
  });
  assertOk(outcome);
  return !!bundle?.entry && bundle.entry.length > 0;
}

/**
 * Creates the public project.
 * This is a special project that is available to all users.
 * It includes 'implementation' resources such as CapabilityStatement.
 */
async function createPublicProject(owner: User): Promise<void> {
  logger.info('Create Public project...');
  const [outcome, result] = await repo.createResource<Project>({
    resourceType: 'Project',
    name: 'Public',
    owner: createReference(owner)
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as Project).id);
}

/**
 * Creates all SearchParameter resources.
 */
async function createSearchParameters(): Promise<void> {
  const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle;

  for (const entry of (searchParams.entry as BundleEntry[])) {
    const searchParam = entry.resource as SearchParameter;

    logger.debug('SearchParameter: ' + searchParam.name);
    const [outcome, result] = await repo.createResource<SearchParameter>({
      ...searchParam,
      text: undefined
    });
    assertOk(outcome);
    logger.debug('Created: ' + (result as SearchParameter).id);
  }
}
