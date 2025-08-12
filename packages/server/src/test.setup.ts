// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId, createReference, getReferenceString, sleep } from '@medplum/core';
import {
  AccessPolicy,
  AsyncJob,
  Bundle,
  BundleEntry,
  ClientApplication,
  Login,
  Project,
  ProjectMembership,
  Resource,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { setDefaultResultOrder } from 'dns';
import { Express } from 'express';
import internal from 'stream';
import request from 'supertest';
import { ServerInviteResponse, inviteUser } from './admin/invite';
import { AuthenticatedRequestContext } from './context';
import { Repository, RepositoryContext, getSystemRepo } from './fhir/repo';
import { generateAccessToken } from './oauth/keys';
import { tryLogin } from './oauth/utils';
import { requestContextStore } from './request-context-store';

// supertest v7 can cause websocket tests to hang without this
setDefaultResultOrder('ipv4first');

export interface TestProjectOptions {
  project?: Partial<Project>;
  accessPolicy?: Partial<AccessPolicy>;
  membership?: Partial<ProjectMembership>;
  superAdmin?: boolean;
  withClient?: boolean;
  withAccessToken?: boolean;
  withRepo?: boolean | Partial<RepositoryContext>;
}

type Exact<T, U extends T> = T & Record<Exclude<keyof U, keyof T>, never>;
type StrictTestProjectOptions<T extends TestProjectOptions> = Exact<TestProjectOptions, T>;

export type TestProjectResult<T extends TestProjectOptions> = {
  project: WithId<Project>;
  accessPolicy: T['accessPolicy'] extends Partial<AccessPolicy> ? WithId<AccessPolicy> : undefined;
  client: T['withClient'] extends true ? WithId<ClientApplication> : undefined;
  membership: T['withClient'] extends true ? WithId<ProjectMembership> : undefined;
  login: T['withAccessToken'] extends true ? WithId<Login> : undefined;
  accessToken: T['withAccessToken'] extends true ? string : undefined;
  repo: T['withRepo'] extends true | Partial<RepositoryContext> ? Repository : undefined;
};

export async function createTestProject<T extends StrictTestProjectOptions<T> = TestProjectOptions>(
  options?: T
): Promise<TestProjectResult<T>> {
  return requestContextStore.run(AuthenticatedRequestContext.system(), async () => {
    const systemRepo = getSystemRepo();

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
      superAdmin: options?.superAdmin,
      ...options?.project,
    });

    let client: WithId<ClientApplication> | undefined;
    let accessPolicy: AccessPolicy | undefined;
    let membership: ProjectMembership | undefined;
    let login: WithId<Login> | undefined;
    let accessToken: string | undefined;
    let repo: Repository | undefined;

    if (options?.withClient || options?.withAccessToken || options?.withRepo) {
      client = await systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        secret: randomUUID(),
        redirectUris: ['https://example.com/'],
        meta: {
          project: project.id,
        },
        name: 'Test Client Application',
        signInForm: {
          welcomeString: 'Test Welcome String',
          logo: {
            url: 'https://example.com/logo.png',
          },
        },
      });

      if (options?.accessPolicy) {
        accessPolicy = await systemRepo.createResource<AccessPolicy>({
          resourceType: 'AccessPolicy',
          meta: { project: project.id },
          ...options.accessPolicy,
        });
      }

      membership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        user: createReference(client),
        profile: createReference(client),
        project: createReference(project),
        accessPolicy: accessPolicy ? createReference(accessPolicy) : undefined,
        ...options?.membership,
      });

      if (options?.withAccessToken) {
        const scope = 'openid';

        login = await systemRepo.createResource<Login>({
          resourceType: 'Login',
          authMethod: 'client',
          user: createReference(client),
          client: createReference(client),
          membership: createReference(membership),
          authTime: new Date().toISOString(),
          scope,
        });

        accessToken = await generateAccessToken({
          login_id: login.id,
          sub: client.id,
          username: client.id,
          client_id: client.id,
          profile: client.resourceType + '/' + client.id,
          scope,
        });
      }

      if (options?.withRepo) {
        const repoContext: RepositoryContext = {
          projects: [project],
          currentProject: project,
          author: createReference(client),
          superAdmin: options?.superAdmin,
          projectAdmin: options?.membership?.admin,
          accessPolicy,
          strictMode: project.strictMode,
          extendedMode: true,
          checkReferencesOnWrite: project.checkReferencesOnWrite,
        };

        if (typeof options.withRepo === 'object') {
          Object.assign(repoContext, options.withRepo);
        }
        repo = new Repository(repoContext);
      }
    }

    return {
      project,
      accessPolicy,
      client,
      membership,
      login,
      accessToken,
      repo,
    } as TestProjectResult<T>;
  });
}

export async function createTestClient(options?: TestProjectOptions): Promise<WithId<ClientApplication>> {
  return (await createTestProject({ ...options, withClient: true })).client;
}

export async function initTestAuth(options?: TestProjectOptions): Promise<string> {
  return (await createTestProject({ ...options, withAccessToken: true })).accessToken;
}

export async function addTestUser(
  project: WithId<Project>,
  accessPolicy?: AccessPolicy
): Promise<ServerInviteResponse & { accessToken: string }> {
  requestContextStore.enterWith(AuthenticatedRequestContext.system());
  if (accessPolicy) {
    const systemRepo = getSystemRepo();
    accessPolicy = await systemRepo.createResource<AccessPolicy>({
      ...accessPolicy,
      meta: { project: project.id },
    });
  }

  const email = randomUUID() + '@example.com';
  const password = randomUUID();
  const inviteResponse = await inviteUser({
    project,
    email,
    password,
    resourceType: 'Practitioner',
    firstName: 'Bob',
    lastName: 'Jones',
    sendEmail: false,
    membership: {
      accessPolicy: accessPolicy && createReference(accessPolicy),
    },
  });

  const { user, profile } = inviteResponse;

  const login = await tryLogin({
    authMethod: 'password',
    email,
    password,
    scope: 'openid',
    nonce: 'nonce',
  });

  const accessToken = await generateAccessToken({
    login_id: login.id,
    sub: user.id,
    username: user.id,
    scope: login.scope as string,
    profile: getReferenceString(profile),
  });

  return { ...inviteResponse, accessToken };
}

/**
 * Sets up the pwnedPassword mock to handle "Have I Been Pwned" requests.
 * @param pwnedPassword - The pwnedPassword mock.
 * @param numPwns - The mock value to return. Zero is a safe password.
 */
export function setupPwnedPasswordMock(pwnedPassword: jest.Mock, numPwns: number): void {
  pwnedPassword.mockImplementation(async () => numPwns);
}

/**
 * Sets up the fetch mock to handle Recaptcha requests.
 * @param fetch - The fetch mock.
 * @param success - Whether the mock should return a successful response.
 */
export function setupRecaptchaMock(fetch: jest.Mock, success: boolean): void {
  fetch.mockImplementation(() => ({
    status: 200,
    json: () => ({ success }),
  }));
}

/**
 * Returns true if the resource is in an entry in the bundle.
 * @param bundle - A bundle of resources.
 * @param resource - The resource to search for.
 * @returns The matching bundle entry, or undefined if not found
 */
export function bundleContains(bundle: Bundle, resource: Resource): BundleEntry | undefined {
  return bundle.entry?.find((entry) => entry.resource?.id === resource.id);
}

/**
 * Waits for a function to evaluate successfully.
 * Use this to wait for async behaviors without a handle.
 * @param fn - Function to call.
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

export async function waitForAsyncJob(contentLocation: string, app: Express, accessToken: string): Promise<AsyncJob> {
  for (let i = 0; i < 100; i++) {
    const res = await request(app)
      .get(new URL(contentLocation).pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    if (res.status !== 202) {
      await sleep(500); // Buffer time to ensure that any remaining async processing has fully completed
      return res.body as AsyncJob;
    }
    await sleep(450);
  }
  throw new Error('Async Job did not complete');
}

const DEFAULT_TEST_CONTEXT = { requestId: 'test-request-id', traceId: 'test-trace-id' };
export function withTestContext<T>(fn: () => T, ctx?: { requestId?: string; traceId?: string }): T {
  return requestContextStore.run(AuthenticatedRequestContext.system(ctx ?? DEFAULT_TEST_CONTEXT), fn);
}

/**
 * Reads a stream into a string.
 * See: https://stackoverflow.com/a/49428486/2051724
 * @param stream - The readable stream.
 * @returns The string contents.
 */
export function streamToString(stream: internal.Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
