import { Bundle, createReference, Organization, Practitioner, Project, StructureDefinition, User } from '@medplum/core';
import bcrypt from 'bcrypt';
import { readJson } from '../../definitions/dist';
import { isOk, OperationOutcomeError, repo } from "./fhir";
import { logger } from "./logger";

export async function seedDatabase() {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

  await createProject();
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
 * Creates the Medplum project.
 * This is a special project for administrative resources.
 */
async function createProject() {
  logger.info('Create Medplum project...');
  const [outcome, result] = await repo.createResource<Project>({
    resourceType: 'Project',
    name: 'Medplum',
    owner: {
      reference: 'User/1'
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
  const [outcome, result] = await repo.createResource<Organization>({
    resourceType: 'Organization',
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

  const [userOutcome, user] = await repo.createResource<User>({
    resourceType: 'User',
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
