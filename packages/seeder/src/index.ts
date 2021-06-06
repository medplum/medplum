import { Bundle, MedplumClient, Organization, Project, User } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { resolve } from 'path';

export async function main() {
  const options: dotenv.DotenvConfigOptions = {};
  if (process.argv.length >= 2) {
    options.path = resolve(process.cwd(), process.argv[2]);
  }

  dotenv.config(options);

  const client = new MedplumClient({
    baseUrl: process.env.MEDPLUM_BASE_URL as string,
    clientId: process.env.MEDPLUM_CLIENT_ID as string,
    fetch
  });

  await setup(client);
}

export async function setup(client: MedplumClient) {
  await createProject(client);
  await createOrganization(client);
  await createUser(client);
  await createStructureDefinitions(client);
}

async function createProject(client: MedplumClient) {
  console.log('Create Medplum project...');

  const searchResult = await client.search('Project');
  if (searchResult.entry && searchResult.entry.length > 0) {
    console.log('Already exists');
    return;
  }

  const createResult = await client.create<Project>({
    resourceType: 'Project',
    name: 'Medplum',
    owner: {
      reference: 'User/1'
    }
  });

  console.log('Created', createResult.id);
}

async function createOrganization(client: MedplumClient) {
  console.log('Create Medplum project...');

  const searchResult = await client.search('Organization');
  if (searchResult.entry && searchResult.entry.length > 0) {
    console.log('Already exists');
    return;
  }

  const createResult = await client.create<Organization>({
    resourceType: 'Organization',
    name: 'Medplum'
  });

  console.log('Created', createResult.id);
}

async function createUser(client: MedplumClient) {
  console.log('Create admin user...');

  const searchResult = await client.search('User');
  if (searchResult.entry && searchResult.entry.length > 0) {
    console.log('Already exists');
    return;
  }

  const passwordHash = await bcrypt.hash('admin', 10);

  const createResult = await client.create<User>({
    resourceType: 'User',
    email: 'admin@medplum.com',
    passwordHash
  });

  console.log('Created', createResult.id);
}

async function createStructureDefinitions(client: MedplumClient) {
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
      console.log('StructureDefinition', resource.name);

      const searchResult = await client.search('StructureDefinition?name=' + encodeURIComponent(resource.name));
      if (searchResult.entry && searchResult.entry.length > 0) {
        console.log('Already exists');
        continue;
      }

      const result = await client.create(resource);
      console.log('Created', result.id);
    }
  }
}

if (process.argv[1].endsWith('index.ts')) {
  main();
}
