import { assertOk, createReference, isOk } from '@medplum/core';
import { Bundle, ClientApplication, Login, Project, ProjectMembership, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { systemRepo } from './fhir';
import { generateAccessToken } from './oauth';

export async function createTestProject(): Promise<{
  project: Project;
  client: ClientApplication;
  membership: ProjectMembership;
}> {
  const [projectOutcome, project] = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: 'Test Project',
    owner: {
      reference: 'User/' + randomUUID(),
    },
    features: ['bots', 'email'],
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

  const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    user: createReference(client),
    profile: createReference(client),
    project: createReference(project),
  });
  assertOk(membershipOutcome, membership);

  return {
    project,
    client,
    membership,
  };
}

export async function createTestClient(): Promise<ClientApplication> {
  return (await createTestProject()).client;
}

export async function initTestAuth(): Promise<string> {
  const { client, membership } = await createTestProject();
  const scope = 'openid';

  const [loginOutcome, login] = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    client: createReference(client),
    membership: createReference(membership),
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
 * Sets up the pwnedPassword mock to handle "Have I Been Pwned" requests.
 * @param pwnedPassword The pwnedPassword mock.
 * @param numPwns The mock value to return. Zero is a safe password.
 */
export function setupPwnedPasswordMock(pwnedPassword: jest.Mock, numPwns: number): void {
  pwnedPassword.mockImplementation(async () => numPwns);
}

/**
 * Sets up the fetch mock to handle Recaptcha requests.
 * @param fetch The fetch mock.
 * @param success Whether the mock should return a successful response.
 */
export function setupRecaptchaMock(fetch: jest.Mock, success: boolean): void {
  fetch.mockImplementation(() => ({
    status: 200,
    json: () => ({ success }),
  }));
}

/**
 * Returns true if the resource is in an entry in the bundle.
 * @param bundle A bundle of resources.
 * @param resource The resource to search for.
 * @returns True if the resource is in the bundle.
 */
export function bundleContains(bundle: Bundle, resource: Resource): boolean {
  return !!bundle.entry?.some((entry) => entry.resource?.id === resource.id);
}
