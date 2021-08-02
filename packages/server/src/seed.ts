import { Bundle, BundleEntry, ClientApplication, createReference, Organization, Practitioner, Project, Resource, SearchParameter, StructureDefinition, User } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ADMIN_USER_ID, MEDPLUM_ORGANIZATION_ID, MEDPLUM_PROJECT_ID, PUBLIC_PROJECT_ID } from './constants';
import { executeQuery, getKnex } from './database';
import { isOk, OperationOutcomeError, repo } from './fhir';
import { logger } from './logger';
import { generateSecret } from './oauth';

export async function seedDatabase(): Promise<void> {
  if (await isSeeded()) {
    logger.info('Already seeded');
    return;
  }

  await createPublicProject();
  await createMedplumProject();
  await createOrganization();
  await createUser();
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
    name: 'Medplum',
    owner: {
      reference: 'User/' + ADMIN_USER_ID
    }
  });

  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }

  logger.info('Created: ' + (result as Project).id);
}

/**
 * Creates the Medplum project.
 * This is a special project for administrative resources.
 */
async function createMedplumProject(): Promise<void> {
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

  logger.info('Created: ' + (result as Project).id);
}

/**
 * Creates the Medplum organization.
 * This is a special organization for super admins.
 */
async function createOrganization(): Promise<void> {
  logger.info('Create Medplum project...');
  const [outcome, result] = await repo.updateResource<Organization>({
    resourceType: 'Organization',
    id: MEDPLUM_ORGANIZATION_ID,
    name: 'Medplum'
  });

  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }

  logger.info('Created: ' + (result as Organization).id);
}

/**
 * Creates the admin user.
 * This is the initial user for first login.
 */
async function createUser(): Promise<void> {
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

  logger.info('Created: ' + (user as User).id);
}

/**
 * Creates the initial client application.
 */
async function createClientApplication(): Promise<void> {
  logger.info('Create client application...');
  const [outcome, result] = await repo.createResource<ClientApplication>({
    resourceType: 'ClientApplication',
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
