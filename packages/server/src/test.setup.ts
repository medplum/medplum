import { createReference, getReferenceString, sleep } from '@medplum/core';
import {
  AccessPolicy,
  AsyncJob,
  Bundle,
  ClientApplication,
  Login,
  Project,
  ProjectMembership,
  Resource,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Express } from 'express';
import internal from 'stream';
import request from 'supertest';
import { ServerInviteResponse, inviteUser } from './admin/invite';
import { AuthenticatedRequestContext, requestContextStore } from './context';
import { Repository, getSystemRepo } from './fhir/repo';
import { generateAccessToken } from './oauth/keys';
import { tryLogin } from './oauth/utils';

export interface TestProjectOptions {
  project?: Partial<Project>;
  accessPolicy?: Partial<AccessPolicy>;
  membership?: Partial<ProjectMembership>;
  superAdmin?: boolean;
  withClient?: boolean;
  withAccessToken?: boolean;
  withRepo?: boolean;
}

type Exact<T, U extends T> = T & Record<Exclude<keyof U, keyof T>, never>;
type StrictTestProjectOptions<T extends TestProjectOptions> = Exact<TestProjectOptions, T>;

export type TestProjectResult<T extends TestProjectOptions> = {
  project: Project;
  accessPolicy: T['accessPolicy'] extends Partial<AccessPolicy> ? AccessPolicy : undefined;
  client: T['withClient'] extends true ? ClientApplication : undefined;
  membership: T['withClient'] extends true ? ProjectMembership : undefined;
  login: T['withAccessToken'] extends true ? Login : undefined;
  accessToken: T['withAccessToken'] extends true ? string : undefined;
  repo: T['withRepo'] extends true ? Repository : undefined;
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

    let client: ClientApplication | undefined = undefined;
    let accessPolicy: AccessPolicy | undefined = undefined;
    let membership: ProjectMembership | undefined = undefined;
    let login: Login | undefined = undefined;
    let accessToken: string | undefined = undefined;
    let repo: Repository | undefined = undefined;

    if (options?.withClient || options?.withAccessToken || options?.withRepo) {
      client = await systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        secret: randomUUID(),
        redirectUri: 'https://example.com/',
        meta: {
          project: project.id as string,
        },
        name: 'Test Client Application',
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
        accessPolicy: accessPolicy && createReference(accessPolicy),
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
          login_id: login.id as string,
          sub: client.id as string,
          username: client.id as string,
          client_id: client.id as string,
          profile: client.resourceType + '/' + client.id,
          scope,
        });
      }

      if (options?.withRepo) {
        repo = new Repository({
          projects: [project.id as string],
          currentProject: project,
          author: createReference(client),
          superAdmin: options?.superAdmin,
          projectAdmin: options?.membership?.admin,
          accessPolicy,
          strictMode: project.strictMode,
          extendedMode: true,
          checkReferencesOnWrite: project.checkReferencesOnWrite,
        });
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

export async function createTestClient(options?: TestProjectOptions): Promise<ClientApplication> {
  return (await createTestProject({ ...options, withClient: true })).client;
}

export async function initTestAuth(options?: TestProjectOptions): Promise<string> {
  return (await createTestProject({ ...options, withAccessToken: true })).accessToken;
}

export async function addTestUser(
  project: Project,
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
    login_id: login.id as string,
    sub: user.id,
    username: user.id as string,
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
 * @returns True if the resource is in the bundle.
 */
export function bundleContains(bundle: Bundle, resource: Resource): boolean {
  return !!bundle.entry?.some((entry) => entry.resource?.id === resource.id);
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
  for (let i = 0; i < 45; i++) {
    const res = await request(app)
      .get(new URL(contentLocation).pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    if (res.status !== 202) {
      return res.body as AsyncJob;
    }
    await sleep(1000);
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
