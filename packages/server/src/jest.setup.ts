import { assertOk, createReference, isOk } from '@medplum/core';
import { ClientApplication, Login, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { systemRepo } from './fhir';
import { generateAccessToken } from './oauth';

export async function createTestClient(): Promise<ClientApplication> {
  const [projectOutcome, project] = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: 'Test Project',
    owner: {
      reference: 'User/' + randomUUID(),
    },
  });
  assertOk(projectOutcome, project);

  const [clientOutcome, client] = await systemRepo.createResource<ClientApplication>({
    resourceType: 'ClientApplication',
    secret: randomUUID(),
    redirectUri: 'https://example.com/',
    meta: {
      project: project.id as string,
    },
  });
  assertOk(clientOutcome, client);
  return client;
}

export async function initTestAuth(): Promise<string> {
  const client = await createTestClient();
  const scope = 'openid';

  const [loginOutcome, login] = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    client: createReference(client),
    profile: createReference(client),
    authTime: new Date().toISOString(),
    scope,
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
    scope,
  });
}

/**
 * Sets up the fetch mock to handle Recaptcha requests.
 * @param fetch The fetch mock.
 * @param success Whether the mock should return a successful response.
 */
export function setupRecaptchaMock(fetch: any, success: boolean): void {
  fetch.mockImplementation(() => ({
    status: 200,
    json: () => ({ success }),
  }));
}
