import { assertOk, ClientApplication, createReference, isOk, Login, Project } from '@medplum/core';
import { randomUUID } from 'crypto';
import { repo } from './fhir';
import { generateAccessToken } from './oauth';

export async function createTestClient(): Promise<ClientApplication> {
  const [projectOutcome, project] = await repo.createResource<Project>({
    resourceType: 'Project',
    name: 'Test Project',
    owner: {
      reference: 'User/' + randomUUID(),
    }
  });
  assertOk(projectOutcome);

  const [clientOutcome, client] = await repo.createResource<ClientApplication>({
    resourceType: 'ClientApplication',
    secret: randomUUID(),
    redirectUri: 'https://example.com/',
    meta: {
      project: project?.id as string
    },
  });
  assertOk(clientOutcome);
  return client as ClientApplication;
}

export async function initTestAuth() {
  const client = await createTestClient();
  const scope = 'openid';

  const [loginOutcome, login] = await repo.createResource<Login>({
    resourceType: 'Login',
    client: createReference(client),
    profile: createReference(client),
    authTime: new Date().toISOString(),
    scope
  });

  if (!isOk(loginOutcome) || !login) {
    throw new Error('Error creating login');
  }

  return generateAccessToken({
    login_id: login.id as string,
    sub: client.id as string,
    username: client.id as string,
    client_id: client.id as string,
    profile: client.resourceType + '/' + client.id,
    scope
  });
}
