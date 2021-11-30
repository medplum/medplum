import { assertOk, Bundle, BundleEntry, ClientApplication, createReference, getReferenceString, Operator, Project, SearchParameter, User } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { registerNew } from './auth/register';
import { getConfig } from './config';
import { PUBLIC_PROJECT_ID } from './constants';
import { repo } from './fhir';
import { logger } from './logger';
import { createStructureDefinitions } from './seeds/structuredefinitions';
import { createValueSetElements } from './seeds/valuesets';

let adminUser: User | undefined = undefined;
let medplumProject: Project | undefined = undefined;
let publicProject: Project | undefined = undefined;
let defaultClientApplication: ClientApplication | undefined = undefined;

export function getAdminUser(): User {
  if (!adminUser) {
    throw new Error('Database not seeded');
  }
  return adminUser;
}

export function getMedplumProject(): Project {
  if (!medplumProject) {
    throw new Error('Database not seeded');
  }
  return medplumProject;
}

export function getPublicProject(): Project {
  if (!publicProject) {
    throw new Error('Database not seeded');
  }
  return publicProject;
}

export function getDefaultClientApplication(): ClientApplication {
  if (!defaultClientApplication) {
    throw new Error('Database not seeded');
  }
  return defaultClientApplication;
}

export async function seedDatabase(): Promise<void> {
  adminUser = await findAdminUser();
  if (adminUser) {
    logger.info('Already seeded');
    medplumProject = await findAdminProject(adminUser, 'Medplum');
    publicProject = await findAdminProject(adminUser, 'Public');
    defaultClientApplication = await findDefaultClientApplication();
    return;
  }

  const registerResponse = await registerNew({
    admin: true,
    firstName: 'Medplum',
    lastName: 'Admin',
    projectName: 'Medplum',
    email: 'admin@medplum.com',
    password: 'admin'
  });

  adminUser = await findAdminUser() as User;
  medplumProject = registerResponse.project;
  defaultClientApplication = registerResponse.client;

  await repo.updateResource({
    ...defaultClientApplication,
    redirectUri: getConfig().appBaseUrl
  });

  await createPublicProject(adminUser);
  await createValueSetElements();
  await createSearchParameters();
  await createStructureDefinitions();
}

/**
 * Returns true if the database is already seeded.
 * @returns True if already seeded.
 */
async function findAdminUser(): Promise<User | undefined> {
  const [outcome, bundle] = await repo.search({
    resourceType: 'User',
    filters: [{
      code: 'email',
      operator: Operator.EQUALS,
      value: 'admin@medplum.com'
    }]
  });
  assertOk(outcome);
  return bundle?.entry && bundle.entry.length > 0 ? bundle.entry[0].resource as User : undefined;
}

async function findAdminProject(owner: User, name: string): Promise<Project | undefined> {
  if (medplumProject) {
    return medplumProject;
  }

  const [outcome, bundle] = await repo.search({
    resourceType: 'Project',
    filters: [
      {
        code: 'owner',
        operator: Operator.EQUALS,
        value: getReferenceString(owner)
      },
      {
        code: 'name',
        operator: Operator.EXACT,
        value: name
      }
    ]
  });
  assertOk(outcome);
  return bundle?.entry && bundle.entry.length > 0 ? bundle.entry[0].resource as Project : undefined;
}

async function findDefaultClientApplication(): Promise<ClientApplication | undefined> {
  const [outcome, bundle] = await repo.search({
    resourceType: 'ClientApplication',
    filters: [
      {
        code: '_project',
        operator: Operator.EQUALS,
        value: medplumProject?.id as string
      },
      {
        code: 'name',
        operator: Operator.EXACT,
        value: 'Medplum Default Client'
      }
    ]
  });
  assertOk(outcome);
  return bundle?.entry && bundle.entry.length > 0 ? bundle.entry[0].resource as ClientApplication : undefined;
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
  assertOk(outcome);
  publicProject = result as Project;
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
