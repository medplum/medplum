import bcrypt from 'bcrypt';
import { Bundle, Organization, Project, User } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { closeDatabase, initDatabase } from './database';
import { repo } from './fhir/repo';
import { Operator } from './fhir/search';
import { loadConfig } from './config';

export async function main() {
  const config = await loadConfig('file:medplum.config.json');
  await initDatabase(config.database);
  await setup();
  await closeDatabase();
}

export async function setup() {
  await createProject();
  await createOrganization();
  await createUser();
  await createStructureDefinitions();
}

async function createProject() {
  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'Project',
    filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Medplum' }]
  });

  if (searchOutcome.id !== 'allok') {
    console.log(searchOutcome);
    return;
  }

  if (searchResult?.entry && searchResult.entry.length > 0) {
    return;
  }

  await repo.createResource<Project>({
    resourceType: 'Project',
    name: 'Medplum',
    owner: {
      reference: 'User/1'
    }
  });
}

async function createOrganization() {
  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'Organization',
    filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Medplum' }]
  });

  if (searchOutcome.id !== 'allok') {
    console.log(searchOutcome);
    return;
  }

  if (searchResult?.entry && searchResult.entry.length > 0) {
    return;
  }

  await repo.createResource<Organization>({
    resourceType: 'Organization',
    name: 'Medplum'
  });
}

async function createUser() {
  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'User',
    filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Medplum' }]
  });

  if (searchOutcome.id !== 'allok') {
    console.log(searchOutcome);
    return;
  }

  if (searchResult?.entry && searchResult.entry.length > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash('admin', 10);

  await repo.createResource<User>({
    resourceType: 'User',
    email: 'admin@medplum.com',
    passwordHash
  });
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

    if (resource.resourceType === 'StructureDefinition') {
      const [searchOutcome, searchResult] = await repo.search({
        resourceType: 'StructureDefinition',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: resource.name as string }]
      });

      if (searchOutcome.id !== 'allok') {
        console.log(searchOutcome);
        return;
      }

      if (searchResult?.entry && searchResult.entry.length > 0) {
        // Update existing
        await repo.updateResource({
          ...resource,
          id: searchResult.entry[0].resource?.id
        });
      } else {
        // Create new
        await repo.createResource(resource);
      }
    }
  }
}

if (process.argv[1].endsWith('setup.ts')) {
  main();
}
