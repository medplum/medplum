import { Bundle, BundleEntry, ClientApplication, CodeSystem, CodeSystemConcept, isOk, OperationOutcomeError, Project, Resource, SearchParameter, StructureDefinition, ValueSet } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { registerNew } from './auth/register';
import { MEDPLUM_CLIENT_APPLICATION_ID, MEDPLUM_PROJECT_ID, PUBLIC_PROJECT_ID } from './constants';
import { getClient } from './database';
import { repo } from './fhir';
import { InsertQuery } from './fhir/sql';
import { logger } from './logger';
import { generateSecret } from './oauth';

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
    project: {
      reference: 'Project/' + MEDPLUM_PROJECT_ID
    },
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
  const bundle = readJson('fhir/r4/valuesets.json') as Bundle<CodeSystem | ValueSet>;

  for (const entry of bundle.entry as BundleEntry<CodeSystem | ValueSet>[]) {
    const resource = entry.resource;
    if (resource?.resourceType === 'CodeSystem') {
      await importCodeSystem(client, resource);
    } else if (resource?.resourceType === 'ValueSet') {
      await importValueSet(client, resource);
    }
  }

  await importSnomed(client);
}

/**
 * Imports all value set elements from a CodeSystem.
 * See: https://www.hl7.org/fhir/codesystem.html
 * @param client The database client.
 * @param codeSystem The FHIR CodeSystem resource.
 */
async function importCodeSystem(client: Pool, codeSystem: CodeSystem): Promise<void> {
  if (!codeSystem.valueSet || !codeSystem.concept) {
    return;
  }
  for (const concept of codeSystem.concept) {
    importCodeSystemConcept(client, codeSystem.valueSet, concept);
  }
}

/**
 * Recursively imports CodeSystem concepts.
 * See: https://www.hl7.org/fhir/codesystem-definitions.html#CodeSystem.concept
 * @param client The database client.
 * @param system The ValueSet system.
 * @param concept The CodeSystem concept.
 */
async function importCodeSystemConcept(client: Pool, system: string, concept: CodeSystemConcept): Promise<void> {
  if (concept.code && concept.display) {
    await insertValueSetElement(client, system, concept.code, concept.display);
  }
  if (concept.concept) {
    for (const child of concept.concept) {
      await importCodeSystemConcept(client, system, child);
    }
  }
}

/**
 * Imports all value set elements from a ValueSet.
 * See: https://www.hl7.org/fhir/valueset.html
 * @param client The database client.
 * @param valueSet The FHIR ValueSet resource.
 */
async function importValueSet(client: Pool, valueSet: ValueSet): Promise<void> {
  if (!valueSet.url || !valueSet.compose?.include) {
    return;
  }
  for (const include of valueSet.compose.include) {
    if (!include.system || !include.concept) {
      continue;
    }
    for (const concept of include.concept) {
      if (concept.code && concept.display) {
        await insertValueSetElement(client, include.system, concept.code, concept.display);
      }
    }
  }
}

async function importSnomed(client: Pool): Promise<void> {
  const system = 'https://snomed.info/sct';

  const values = [
    { id: '316791000119102', name: 'Pain in left knee' },
    { id: '316931000119104', name: 'Pain in right knee' },
    { id: '287045000', name: 'Pain in left arm' },
    { id: '287046004', name: 'Pain in right arm' }
  ];

  for (const value of values) {
    await insertValueSetElement(client, system, value.id, value.name);
  }
}

async function insertValueSetElement(client: Pool, system: string, code: string, display: string): Promise<void> {
  new InsertQuery('ValueSetElement', {
    id: randomUUID(),
    system,
    code,
    display
  }).execute(client);
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
