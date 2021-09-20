import { assertOk, Bundle, BundleEntry, ClientApplication, isOk, OperationOutcomeError, Project, SearchParameter } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { registerNew } from './auth/register';
import { MEDPLUM_CLIENT_APPLICATION_ID, MEDPLUM_PROJECT_ID, PUBLIC_PROJECT_ID } from './constants';
import { repo } from './fhir';
import { logger } from './logger';
import { generateSecret } from './oauth';
import { createStructureDefinitions } from './seeds/structuredefinitions';
import { createValueSetElements } from './seeds/valuesets';

export async function seedDatabase(): Promise<void> {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

  await registerNew({
    admin: true,
    firstName: 'Medplum',
    lastName: 'Admin',
    projectName: 'Medplum',
    email: 'admin@medplum.com',
    password: 'admin'
  });

  await createPublicProject();
  await createClientApplication();
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
    filters: []
  });

  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }

  return !!(bundle && bundle.entry && bundle.entry.length > 0);
}

/**
 * Creates the public project.
 * This is a special project that is available to all users.
 * It includes 'implementation' resources such as CapabilityStatement.
 */
async function createPublicProject(): Promise<void> {
  logger.info('Create Public project...');
  const [outcome, result] = await repo.updateResource<Project>({
    resourceType: 'Project',
    id: PUBLIC_PROJECT_ID,
    name: 'Public',
    owner: {
      reference: 'Project/' + PUBLIC_PROJECT_ID
    }
  });

  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }

  logger.info('Created: ' + (result as Project).id);
}

/**
 * Creates the initial client application.
 */
async function createClientApplication(): Promise<void> {
  logger.info('Create client application...');
  const [outcome, result] = await repo.updateResource<ClientApplication>({
    resourceType: 'ClientApplication',
    id: MEDPLUM_CLIENT_APPLICATION_ID,
    name: 'OpenID Certification',
    meta: {
      project: MEDPLUM_PROJECT_ID
    },
    secret: generateSecret(48),
    redirectUri: 'https://www.certification.openid.net/test/a/medplum/callback',
  });
  assertOk(outcome);

  logger.info('Created: ' + (result as ClientApplication).id);
  logger.info('  name = ' + result?.name);
  logger.info('  client_id = ' + result?.id);
  logger.info('  client_secret = ' + result?.secret);
  logger.info('  redirect_uri = ' + result?.redirectUri);
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

    if (!isOk(outcome)) {
      throw new OperationOutcomeError(outcome);
    }

    logger.debug('Created: ' + (result as SearchParameter).id);
  }
}
