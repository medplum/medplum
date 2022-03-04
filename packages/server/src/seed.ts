import { assertOk, createReference } from '@medplum/core';
import { ClientApplication, Project, User } from '@medplum/fhirtypes';
import { registerNew } from './auth/register';
import { getConfig } from './config';
import { systemRepo } from './fhir';
import { logger } from './logger';
import { createSearchParameters } from './seeds/searchparameters';
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
    password: 'medplum_admin',
  });

  const client = registerResponse.client as ClientApplication;
  await systemRepo.updateResource({ ...client, redirectUri: getConfig().appBaseUrl });

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
  const [outcome, bundle] = await systemRepo.search({
    resourceType: 'User',
    count: 1,
  });
  assertOk(outcome, bundle);
  return !!bundle.entry && bundle.entry.length > 0;
}

/**
 * Creates the public project.
 * This is a special project that is available to all users.
 * It includes 'implementation' resources such as CapabilityStatement.
 */
async function createPublicProject(owner: User): Promise<void> {
  logger.info('Create Public project...');
  const [outcome, result] = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: 'Public',
    owner: createReference(owner),
  });
  assertOk(outcome, result);
  logger.info('Created: ' + result.id);
}
