import { Bundle, createReference, Organization, Practitioner, Project, StructureDefinition, User } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import bcrypt from 'bcrypt';
import { ADMIN_USER_ID, MEDPLUM_ORGANIZATION_ID, MEDPLUM_PROJECT_ID, PUBLIC_PROJECT_ID } from './constants';
import { isOk, OperationOutcomeError, repo } from './fhir';
import { logger } from './logger';

export async function seedDatabase() {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

  await createPublicProject();
  await createMedplumProject();
  await createOrganization();
  await createUser();
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
async function createPublicProject() {
  logger.info('Create Public project...');
  const [outcome, result] = await repo.updateResource<Project>({
    resourceType: 'Project',
    id: PUBLIC_PROJECT_ID,
    name: 'Medplum',
    owner: {
      reference: 'User/' + ADMIN_USER_ID
    }
  });

  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }

  logger.info('Created', (result as Project).id);
}

/**
 * Creates the Medplum project.
 * This is a special project for administrative resources.
 */
async function createMedplumProject() {
  logger.info('Create Medplum project...');
  const [outcome, result] = await repo.updateResource<Project>({
    resourceType: 'Project',
    id: MEDPLUM_PROJECT_ID,
    name: 'Medplum',
    owner: {
      reference: 'User/' + ADMIN_USER_ID
    }
  });

  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }

  logger.info('Created', (result as Project).id);
}

/**
 * Creates the Medplum organization.
 * This is a special organization for super admins.
 */
async function createOrganization() {
  logger.info('Create Medplum project...');
  const [outcome, result] = await repo.updateResource<Organization>({
    resourceType: 'Organization',
    id: MEDPLUM_ORGANIZATION_ID,
    name: 'Medplum'
  });

  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }

  logger.info('Created', (result as Organization).id);
}

/**
 * Creates the admin user.
 * This is the initial user for first login.
 */
async function createUser() {
  logger.info('Create admin user...');
  const [practitionerOutcome, practitioner] = await repo.createResource<Practitioner>({
    resourceType: 'Practitioner',
    name: [{
      given: ['Medplum'],
      family: 'Admin'
    }]
  });

  if (!isOk(practitionerOutcome)) {
    throw new OperationOutcomeError(practitionerOutcome);
  }

  const passwordHash = await bcrypt.hash('admin', 10);

  const [userOutcome, user] = await repo.updateResource<User>({
    resourceType: 'User',
    id: ADMIN_USER_ID,
    email: 'admin@medplum.com',
    passwordHash,
    practitioner: createReference(practitioner as Practitioner)
  });

  if (!isOk(userOutcome)) {
    throw new OperationOutcomeError(userOutcome);
  }

  logger.info('Created', (user as User).id);
}

async function createStructureDefinitions() {
  const structureDefinitions = readJson('fhir/r4/profiles-resources.json') as Bundle;
  const entries = structureDefinitions.entry;
  if (!entries) {
    return;
  }

  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }

    if (resource.resourceType === 'StructureDefinition' && resource.name) {
      logger.info('StructureDefinition', resource.name);
      const [outcome, result] = await repo.createResource<StructureDefinition>(resource);

      if (!isOk(outcome)) {
        throw new OperationOutcomeError(outcome);
      }

      logger.info('Created', (result as StructureDefinition).id);
    }
  }
}
