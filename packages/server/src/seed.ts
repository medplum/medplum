import { Bundle, BundleEntry, ClientApplication, createReference, Project, Resource, SearchParameter, StructureDefinition, User } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { randomUUID } from 'crypto';
import { registerNew } from './auth/register';
import { MEDPLUM_CLIENT_APPLICATION_ID, PUBLIC_PROJECT_ID } from './constants';
import { getClient } from './database';
import { isOk, OperationOutcomeError, repo } from './fhir';
import { InsertQuery } from './fhir/sql';
import { logger } from './logger';
import { generateSecret } from './oauth';

export async function seedDatabase(): Promise<void> {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

  const result = await registerNew({
    firstName: 'Medplum',
    lastName: 'Admin',
    projectName: 'Medplum',
    email: 'admin@medplum.com',
    password: 'admin'
  });

  await createPublicProject(result.user);
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
async function createPublicProject(owner: User): Promise<void> {
  logger.info('Create Public project...');
  const [outcome, result] = await repo.updateResource<Project>({
    resourceType: 'Project',
    id: PUBLIC_PROJECT_ID,
    name: 'Public',
    owner: createReference(owner)
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
    secret: generateSecret(48),
    redirectUri: 'https://www.certification.openid.net/test/a/medplum/callback',
  });

  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }

  logger.info('Created: ' + (result as ClientApplication).id);
  logger.info('  name = ' + result?.name);
  logger.info('  client_id = ' + result?.id);
  logger.info('  client_secret = ' + result?.secret);
  logger.info('  redirect_uri = ' + result?.redirectUri);
}

/**
 * Creates test ValueSetElement rows.
 */
async function createValueSetElements(): Promise<void> {
  const client = getClient();
  const system = 'https://snomed.info/sct';

  const values = [
    { id: '316791000119102', name: 'Pain in left knee' },
    { id: '316931000119104', name: 'Pain in right knee' },
    { id: '287045000', name: 'Pain in left arm' },
    { id: '287046004', name: 'Pain in right arm' }
  ];

  for (const value of values) {
    await new InsertQuery('ValueSetElement', {
      id: randomUUID(),
      system,
      code: value.id,
      display: value.name
    }).execute(client);
  }
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

/**
 * Creates all StructureDefinition resources.
 */
async function createStructureDefinitions(): Promise<void> {
  const structureDefinitions = readJson('fhir/r4/profiles-resources.json') as Bundle;
  for (const entry of (structureDefinitions.entry as BundleEntry[])) {
    const resource = entry.resource as Resource;

    if (resource.resourceType === 'StructureDefinition' && resource.name) {
      logger.debug('StructureDefinition: ' + resource.name);
      const [outcome, result] = await repo.createResource<StructureDefinition>({
        ...resource,
        text: undefined
      });

      if (!isOk(outcome)) {
        throw new OperationOutcomeError(outcome);
      }

      logger.debug('Created: ' + (result as StructureDefinition).id);
    }
  }
}
