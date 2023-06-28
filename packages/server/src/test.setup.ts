import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import {
  AccessPolicy,
  Bundle,
  ClientApplication,
  Login,
  Project,
  ProjectMembership,
  Resource,
  User,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Express } from 'express';
import request from 'supertest';
import { inviteUser } from './admin/invite';
import { systemRepo } from './fhir/repo';
import { generateAccessToken } from './oauth/keys';
import { tryLogin } from './oauth/utils';

export async function createTestProject(options?: Partial<Project>): Promise<{
  project: Project;
  client: ClientApplication;
  membership: ProjectMembership;
}> {
  const project = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: 'Test Project',
    owner: {
      reference: 'User/' + randomUUID(),
    },
    strictMode: true,
    features: ['bots', 'email', 'graphql-introspection', 'cron'],
    secret: [
      {
        name: 'foo',
        valueString: 'bar',
      },
    ],
    ...options,
  });

  const client = await systemRepo.createResource<ClientApplication>({
    resourceType: 'ClientApplication',
    secret: randomUUID(),
    redirectUri: 'https://example.com/',
    meta: {
      project: project.id as string,
    },
    name: 'Test Client Application',
  });

  const membership = await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    user: createReference(client),
    profile: createReference(client),
    project: createReference(project),
  });

  return {
    project,
    client,
    membership,
  };
}

export async function createTestClient(options?: Partial<Project>): Promise<ClientApplication> {
  return (await createTestProject(options)).client;
}

export async function initTestAuth(options?: Partial<Project>): Promise<string> {
  const { client, membership } = await createTestProject(options);
  const scope = 'openid';

  const login = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    authMethod: 'client',
    user: createReference(client),
    client: createReference(client),
    membership: createReference(membership),
    authTime: new Date().toISOString(),
    superAdmin: options?.superAdmin,
    scope,
  });

  return generateAccessToken({
    login_id: login.id as string,
    sub: client.id as string,
    username: client.id as string,
    client_id: client.id as string,
    profile: client.resourceType + '/' + client.id,
    scope,
  });
}

export async function addTestUser(
  project: Project,
  accessPolicy?: AccessPolicy
): Promise<{ user: User; profile: ProfileResource; accessToken: string }> {
  if (accessPolicy) {
    accessPolicy = await systemRepo.createResource<AccessPolicy>({
      ...accessPolicy,
      meta: { project: project.id },
    });
  }

  const email = randomUUID() + '@example.com';
  const password = randomUUID();
  const { user, profile } = await inviteUser({
    project,
    email,
    password,
    resourceType: 'Practitioner',
    firstName: 'Bob',
    lastName: 'Jones',
    accessPolicy: accessPolicy && createReference(accessPolicy),
    sendEmail: false,
  });

  const login = await tryLogin({
    authMethod: 'password',
    email,
    password,
    scope: 'openid',
    nonce: 'nonce',
  });

  const accessToken = await generateAccessToken({
    login_id: login.id as string,
    sub: user.id,
    username: user.id as string,
    scope: login.scope as string,
    profile: getReferenceString(profile),
  });

  return { user, profile, accessToken };
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

/**
 * Waits for a function to evaluate successfully.
 * Use this to wait for async behaviors without a handle.
 * @param fn Function to call.
 */
export function waitFor(fn: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      fn()
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch(() => {
          // ignore
        });
    }, 100);
  });
}

export async function waitForJob(app: Express, contentLocation: string, accessToken: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const res = await request(app)
      .get(new URL(contentLocation).pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    if (res.status !== 202) {
      return;
    }
    await sleep(1000);
  }
  throw new Error('Job did not complete');
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
