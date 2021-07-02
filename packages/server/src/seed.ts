import { Bundle, ClientApplication, createReference, Organization, Practitioner, Project, StructureDefinition, User } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ADMIN_USER_ID, MEDPLUM_ORGANIZATION_ID, MEDPLUM_PROJECT_ID, PUBLIC_PROJECT_ID } from './constants';
import { executeQuery, getKnex } from './database';
import { isOk, OperationOutcomeError, repo } from './fhir';
import { logger } from './logger';
import { generateSecret } from './oauth';

export async function seedDatabase() {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

  await createPublicProject();
  await createMedplumProject();
  await createOrganization();
  await createUser();
  await createClientApplication();
  await createStructureDefinitions();
  await createValueSetElements();
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
    }],
    telecom: [
      {
        system: 'email',
        use: 'work',
        value: 'admin@medplum.com'
      },
      {
        system: 'phone',
        use: 'work',
        value: '415-867-5309'
      }
    ],
    address: [
      {
        use: 'work',
        type: 'both',
        line: [
          '742 Evergreen Terrace'
        ],
        city: 'Springfield',
        state: 'OR',
        postalCode: '97403'
      }
    ],
    birthDate: '2000-01-01'
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

/**
 * Creates the initial client application.
 */
async function createClientApplication() {
  logger.info('Create client application...');
  const [outcome, result] = await repo.createResource<ClientApplication>({
    resourceType: 'ClientApplication',
    secret: generateSecret(48),
    redirectUri: 'https://www.certification.openid.net/test/a/medplum/callback',
  });

  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }

  logger.info('Created', (result as ClientApplication).id);
  logger.info('  client_id = ' + result?.id);
  logger.info('  client_secret = ' + result?.secret);
  logger.info('  redirect_uri = ' + result?.redirectUri);
}

/**
 * Creates all StructureDefinition resources.
 */
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
      logger.debug('StructureDefinition: ' + resource.name);
      const [outcome, result] = await repo.createResource<StructureDefinition>(resource);

      if (!isOk(outcome)) {
        throw new OperationOutcomeError(outcome);
      }

      logger.debug('Created: ' + (result as StructureDefinition).id);
    }
  }
}

/**
 * Creates test ValueSetElement rows.
 */
async function createValueSetElements() {
  const knex = getKnex();

  const countQuery = await knex('ValueSetElement').count('id').first().then(executeQuery);
  if (countQuery && countQuery.count > 0) {
    return;
  }

  const system = 'https://snomed.info/sct';

  const values = [
    { id: '316791000119102', name: 'Pain in left knee' },
    { id: '316931000119104', name: 'Pain in right knee' },
    { id: '287045000', name: 'Pain in left arm' },
    { id: '287046004', name: 'Pain in right arm' }
  ];

  for (const value of values) {
    await knex('ValueSetElement').insert({
      id: randomUUID(),
      system,
      code: value.id,
      display: value.name
    }).then(executeQuery);
  }
}
