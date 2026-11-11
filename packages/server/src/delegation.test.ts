// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { WithId } from '@medplum/core';
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import type {
  AccessPolicy,
  AsyncJob,
  Bundle,
  ClientApplication,
  Login,
  Observation,
  Organization,
  Parameters,
  Patient,
  Project,
  ProjectMembership,
  Subscription,
} from '@medplum/fhirtypes';
import { mockClient } from 'aws-sdk-client-mock';
import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import { getShardSystemRepo } from './fhir/repo';
import { PLACEHOLDER_SHARD_ID } from './fhir/sharding';
import { generateAccessToken } from './oauth/keys';
import {
  addTestUser,
  createTestProject,
  getSuperAdminAccessToken,
  getSuperAdminTestProject,
  mockStdoutWrite,
} from './test.setup';
import { queueRegistry } from './workers/utils';

// Every route here must act as the effective identity: the On-Behalf-Of member if given, otherwise the caller.
// Add a route when it:
// 1. Reads identity outside `ctx.repo`: `ctx.authState`, `ctx.login`, the caller's User, a profile or
//    membership read with a system repo, or a forwarded access token.
// 2. Authorizes on identity flags instead of the access policy: `membership.admin`, `project.superAdmin`,
//    project features, quota or resource-cap buckets.
// 3. Serializes authentication for later execution, such as a queued job. Compare it to the sync route.
// 4. Mints credentials or manages an account: tokens, codes, secrets, sessions, MFA.
// Routes that only use `ctx.repo` are enforced by the access policy and need no row here.

const DELEGATION_CASES = [
  'admin user',
  'member user',
  'admin user as member user',
  'admin client as admin user',
  'admin client as member user',
  'super admin as member of another project',
  'SMART-scoped admin client as admin user',
] as const;

type DelegationCaseName = (typeof DELEGATION_CASES)[number];

interface DelegationCase {
  readonly headers: Readonly<Record<string, string>>;
  readonly actor: 'user' | 'admin client' | 'super admin';
  readonly callerUserId: string;
  readonly smartScoped: boolean;
  readonly delegated: boolean;
  readonly effective: {
    readonly project: WithId<Project>;
    readonly membership: WithId<ProjectMembership>;
    readonly admin: boolean;
  };
  readonly canReadPatient: boolean;
}

interface DelegationFixture {
  readonly project: WithId<Project>;
  readonly otherProject: WithId<Project>;
  readonly adminClient: WithId<ClientApplication>;
  readonly adminClientToken: string;
  readonly cases: Readonly<Record<DelegationCaseName, DelegationCase>>;
}

async function createClientToken(
  client: WithId<ClientApplication>,
  membership: WithId<ProjectMembership>,
  scope: string
): Promise<string> {
  const login = await getShardSystemRepo(PLACEHOLDER_SHARD_ID).createResource<Login>({
    resourceType: 'Login',
    authMethod: 'client',
    user: createReference(client),
    client: createReference(client),
    membership: createReference(membership),
    authTime: new Date().toISOString(),
    granted: true,
    scope,
  });
  return generateAccessToken({
    login_id: login.id,
    sub: client.id,
    username: client.id,
    client_id: client.id,
    profile: getReferenceString(client),
    scope,
  });
}

async function createDelegationFixture(): Promise<DelegationFixture> {
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID);
  const memberPolicy: AccessPolicy = {
    resourceType: 'AccessPolicy',
    resource: [
      // Own profile, for /oauth2/userinfo
      { resourceType: 'Practitioner', criteria: 'Practitioner?_id=%profile.id', readonly: true },
      // Readable data, while Patient stays denied
      { resourceType: 'Observation' },
      // Starting async requests, so the job decides what members can access
      { resourceType: 'AsyncJob' },
      // Async batch results
      { resourceType: 'Binary' },
      // $get-ws-binding-token, so delegated rows are refused for On-Behalf-Of, not for missing access
      { resourceType: 'Subscription', readonly: true },
    ],
  };
  const features: Project['features'] = ['email', 'async-batch', 'ai', 'websocket-subscriptions'];

  const {
    project,
    client,
    membership: clientMembership,
  } = await createTestProject({ project: { features }, withClient: true, membership: { admin: true } });
  const adminUser = await addTestUser(project);
  const adminMembership = await systemRepo.updateResource({ ...adminUser.membership, admin: true });
  const memberUser = await addTestUser(project, { accessPolicy: memberPolicy });
  const { project: otherProject } = await createTestProject({ project: { features } });
  const otherMember = await addTestUser(otherProject, { accessPolicy: memberPolicy });

  const clientToken = await createClientToken(client, clientMembership, 'openid');
  const scopedToken = await createClientToken(
    client,
    clientMembership,
    'openid user/Observation.rs user/AsyncJob.cruds user/Binary.cruds'
  );
  const superAdmin = await getSuperAdminTestProject();
  // Logout revokes the caller's login, so do not use the super admin login shared by the test run
  const superAdminToken = await createClientToken(superAdmin.client, superAdmin.membership, 'openid');

  const headers = (token: string, onBehalfOf?: WithId<ProjectMembership>): Record<string, string> => ({
    Authorization: 'Bearer ' + token,
    ...(onBehalfOf && { 'X-Medplum-On-Behalf-Of': getReferenceString(onBehalfOf) }),
  });
  const admin = { project, membership: adminMembership, admin: true };
  const member = { project, membership: memberUser.membership, admin: false };
  const direct = { actor: 'user', smartScoped: false, delegated: false } as const;
  const delegated = { smartScoped: false, delegated: true } as const;

  return {
    project,
    otherProject,
    adminClient: client,
    adminClientToken: clientToken,
    cases: {
      'admin user': {
        ...direct,
        callerUserId: adminUser.user.id,
        headers: headers(adminUser.accessToken),
        effective: admin,
        canReadPatient: true,
      },
      'member user': {
        ...direct,
        callerUserId: memberUser.user.id,
        headers: headers(memberUser.accessToken),
        effective: member,
        canReadPatient: false,
      },
      'admin user as member user': {
        ...delegated,
        actor: 'user',
        callerUserId: adminUser.user.id,
        headers: headers(adminUser.accessToken, memberUser.membership),
        effective: member,
        canReadPatient: false,
      },
      'admin client as admin user': {
        ...delegated,
        actor: 'admin client',
        callerUserId: client.id,
        headers: headers(clientToken, adminMembership),
        effective: admin,
        canReadPatient: true,
      },
      'admin client as member user': {
        ...delegated,
        actor: 'admin client',
        callerUserId: client.id,
        headers: headers(clientToken, memberUser.membership),
        effective: member,
        canReadPatient: false,
      },
      'super admin as member of another project': {
        ...delegated,
        actor: 'super admin',
        callerUserId: superAdmin.client.id,
        headers: headers(superAdminToken, otherMember.membership),
        effective: { project: otherProject, membership: otherMember.membership, admin: false },
        canReadPatient: false,
      },
      'SMART-scoped admin client as admin user': {
        ...delegated,
        actor: 'admin client',
        smartScoped: true,
        callerUserId: client.id,
        headers: headers(scopedToken, adminMembership),
        effective: admin,
        canReadPatient: false,
      },
    },
  };
}

describe('On-Behalf-Of delegation matrix', () => {
  const app = express();
  const ses = mockClient(SESv2Client);
  let fixture: DelegationFixture;
  const seeded = new Map<
    string,
    { patient: Patient; organization: Organization; subscription: WithId<Subscription> }
  >();

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.emailProvider = 'awsses';
    await initApp(app, config);
    ses.on(SendEmailCommand).resolves({ MessageId: 'test' });
    fixture = await createDelegationFixture();

    const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID);
    for (const project of [fixture.project, fixture.otherProject]) {
      const meta = { project: project.id };
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient', meta });
      await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        meta,
        status: 'final',
        code: { text: 'test' },
        subject: createReference(patient),
      });
      const organization = await systemRepo.createResource<Organization>({ resourceType: 'Organization', meta });
      const subscription = await systemRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        meta,
        status: 'active',
        reason: 'test',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      seeded.set(project.id, { patient, organization, subscription });
    }

    // Run queued jobs through the processors the workers registered with the mocked bullmq Worker
    for (const queueName of ['BatchQueue', 'SetAccountsQueue', 'BulkExportQueue']) {
      const processor = vi.mocked(Worker).mock.calls.findLast(([name]) => name === queueName)?.[1] as (
        job: Job
      ) => Promise<void>;
      vi.mocked(queueRegistry.get(queueName)?.add)?.mockImplementation(async (name, data) => {
        const job = mockJob(name, data);
        await processor(job);
        return job;
      });
    }
  });

  afterAll(async () => {
    ses.restore();
    await shutdownApp();
  });

  function mockJob<T>(name: string, data: T): Job<T> {
    const job = {
      id: randomUUID(),
      name,
      data,
      async updateData(newData: T) {
        job.data = newData;
      },
      async moveToDelayed() {},
    };
    return job as unknown as Job<T>;
  }

  async function readAsSuperAdmin<T>(path: string): Promise<T> {
    const res = await request(app)
      .get(path)
      .set('Authorization', 'Bearer ' + (await getSuperAdminAccessToken()));
    expect(res).toHaveStatus(200);
    return res.body as T;
  }

  test.each(DELEGATION_CASES)('/auth/me as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app).get('/auth/me').set(c.headers);
    expect(res).toHaveStatus(200);
    expect(res.body.project.id).toBe(c.effective.project.id);
    expect(res.body.membership.id).toBe(c.effective.membership.id);
    expect(JSON.stringify(res.body)).not.toContain(fixture.adminClient.secret);
  });

  test.each(DELEGATION_CASES)('FHIR search as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app).get('/fhir/R4/Patient').set(c.headers);
    expect(res).toHaveStatus(c.canReadPatient ? 200 : 403);
  });

  test.each(DELEGATION_CASES)('Sync and async batch agree as %s', async (name) => {
    const c = fixture.cases[name];
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [{ request: { method: 'GET', url: 'Patient' } }],
    };

    const syncRes = await request(app).post('/fhir/R4/').set(c.headers).type(ContentType.FHIR_JSON).send(bundle);
    expect(syncRes).toHaveStatus(200);
    const syncStatus = (syncRes.body as Bundle).entry?.[0]?.response?.status;
    expect(syncStatus).toMatch(c.canReadPatient ? /^200/ : /^403/);

    const asyncRes = await request(app)
      .post('/fhir/R4/')
      .set(c.headers)
      .set('Prefer', 'respond-async')
      .type(ContentType.FHIR_JSON)
      .send(bundle);
    expect(asyncRes).toHaveStatus(202);
    const asyncJob: AsyncJob = await readAsSuperAdmin(new URL(asyncRes.body.issue[0].diagnostics).pathname);
    const results = asyncJob.output?.parameter?.find((p) => p.name === 'results')?.valueReference?.reference;
    const resultsBundle: Bundle = await readAsSuperAdmin(`/fhir/R4/${results}`);
    expect(resultsBundle.entry?.[0]?.response?.status).toBe(syncStatus);
  });

  test.each(DELEGATION_CASES)('Bulk export as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app).post('/fhir/R4/$export').set(c.headers).type(ContentType.FHIR_JSON).send({});
    expect(res).toHaveStatus(202);
    const status = await readAsSuperAdmin<{ output: { type: string }[] }>(
      new URL(res.headers['content-location']).pathname
    );
    const types = status.output.map((o) => o.type);
    expect(types).toContain('Observation');
    expect(types.includes('Patient')).toBe(c.canReadPatient);
  });

  test.each(DELEGATION_CASES)('Sync and async $set-accounts agree as %s', async (name) => {
    const c = fixture.cases[name];
    const { patient, organization } = seeded.get(c.effective.project.id) as {
      patient: Patient;
      organization: Organization;
    };
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'accounts', valueReference: createReference(organization) },
        { name: 'propagate', valueBoolean: true },
      ],
    };
    const url = `/fhir/R4/Patient/${patient.id}/$set-accounts`;
    const allowed = c.effective.admin && c.canReadPatient;

    const syncRes = await request(app).post(url).set(c.headers).type(ContentType.FHIR_JSON).send(params);
    expect(syncRes).toHaveStatus(allowed ? 200 : 403);

    const stdout = mockStdoutWrite();
    let asyncRes: request.Response;
    let logged: string;
    try {
      asyncRes = await request(app)
        .post(url)
        .set(c.headers)
        .set('Prefer', 'respond-async')
        .type(ContentType.FHIR_JSON)
        .send(params);
    } finally {
      logged = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
      stdout.mockRestore();
    }
    expect(asyncRes).toHaveStatus(202);
    const asyncJob: AsyncJob = await readAsSuperAdmin(new URL(asyncRes.headers['content-location']).pathname);
    expect(asyncJob.status).toBe(allowed ? 'completed' : 'error');
    expect(logged.includes('AsyncJob execution failed')).toBe(!allowed);
  });

  test.each(DELEGATION_CASES)('/email/v1/send as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app)
      .post('/email/v1/send')
      .set(c.headers)
      .type(ContentType.JSON)
      .send({ to: 'alice@example.com', subject: 'Subject', text: 'Body' });
    expect(res).toHaveStatus(c.effective.admin ? 200 : 403);
  });

  test.each(DELEGATION_CASES)('Account routes refuse delegation as %s', async (name) => {
    const c = fixture.cases[name];
    const json = (path: string, body: object): request.Test =>
      request(app).post(path).set(c.headers).type(ContentType.JSON).send(body);
    const statuses = {
      mfaStatus: (await request(app).get('/auth/mfa/status').set(c.headers)).status,
      mfaEnroll: (await json('/auth/mfa/enroll', { token: '000000' })).status,
      mfaEmailChallenge: (await json('/auth/mfa/send-email-challenge', {})).status,
      mfaDisable: (await json('/auth/mfa/disable', { token: '000000' })).status,
      revoke: (await json('/auth/revoke', { loginId: randomUUID() })).status,
    };
    if (c.delegated) {
      expect(statuses).toStrictEqual({
        mfaStatus: 403,
        mfaEnroll: 403,
        mfaEmailChallenge: 403,
        mfaDisable: 403,
        revoke: 403,
      });
    } else {
      expect(statuses).toStrictEqual({
        mfaStatus: 200,
        mfaEnroll: 400,
        mfaEmailChallenge: 400,
        mfaDisable: 400,
        revoke: 404,
      });
    }
  });

  test.each(DELEGATION_CASES)('/auth/preauthorize as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app)
      .post('/auth/preauthorize')
      .set(c.headers)
      .type(ContentType.JSON)
      .send({ clientId: fixture.adminClient.id });
    if (!c.delegated) {
      expect(res).toHaveStatus(c.effective.admin ? 400 : 403);
    } else {
      expect(res).toHaveStatus(c.actor === 'super admin' ? 403 : 200);
    }
  });

  test.each(DELEGATION_CASES)('$explain as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set(c.headers)
      .type(ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'query', valueString: 'Patient' }],
      } satisfies Parameters);
    expect(res).toHaveStatus(c.actor === 'super admin' ? 200 : 403);
  });

  test.each(DELEGATION_CASES)('Patient $export as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app).post('/fhir/R4/Patient/$export').set(c.headers).type(ContentType.FHIR_JSON).send({});
    expect(res).toHaveStatus(202);
    const status = await readAsSuperAdmin<{ output: { type: string }[] }>(
      new URL(res.headers['content-location']).pathname
    );
    expect(status.output.some((o) => o.type === 'Patient')).toBe(c.canReadPatient);
  });

  test.each(DELEGATION_CASES)('POST /oauth2/logout as %s', async (name) => {
    // A successful logout revokes the token's login, so use new tokens rather than the shared fixture's
    const c = (await createDelegationFixture()).cases[name];
    const res = await request(app).post('/oauth2/logout').set(c.headers);
    expect(res).toHaveStatus(c.delegated ? 403 : 200);
  });

  test.each(DELEGATION_CASES)('$get-ws-binding-token as %s', async (name) => {
    const c = fixture.cases[name];
    const { subscription } = seeded.get(c.effective.project.id) as { subscription: WithId<Subscription> };
    const res = await request(app).get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`).set(c.headers);
    // The token is issued for the caller's own login
    expect(res).toHaveStatus(c.delegated ? 403 : 200);
  });

  test.each(DELEGATION_CASES)('GET /oauth2/userinfo as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app).get('/oauth2/userinfo').set(c.headers);
    // `sub` is the caller's User, even under On-Behalf-Of
    expect(res).toHaveStatus(c.smartScoped ? 403 : 200);
    expect(res.body.sub).toBe(c.smartScoped ? undefined : c.callerUserId);
  });

  test.each(DELEGATION_CASES)('POST /oauth2/introspect as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app)
      .post('/oauth2/introspect')
      .set(c.headers)
      .type('form')
      .send({ token: fixture.adminClientToken });
    expect(res).toHaveStatus(200);
    // Only the token's client may introspect it; a super admin under On-Behalf-Of loses super admin access
    expect(res.body.active).toBe(c.actor === 'admin client');
  });

  test.each(DELEGATION_CASES)('POST /scim/v2/Users as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app)
      .post('/scim/v2/Users')
      .set(c.headers)
      .type(ContentType.JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: randomUUID(),
        name: { givenName: 'Scim', familyName: 'User' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    // `invitedBy` comes from the caller's login, which must be a User
    if (c.effective.admin) {
      expect(res).toHaveStatus(c.actor === 'user' ? 201 : 400);
    } else {
      expect(res).toHaveStatus(403);
    }
  });

  test.each(DELEGATION_CASES)('POST /admin/projects/:projectId/invite as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app)
      .post(`/admin/projects/${c.effective.project.id}/invite`)
      .set(c.headers)
      .type(ContentType.JSON)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Invited',
        lastName: 'User',
        email: randomUUID() + '@example.com',
        sendEmail: false,
      });
    expect(res).toHaveStatus(c.effective.admin ? 200 : 403);
  });

  test.each(DELEGATION_CASES)('$ai as %s', async (name) => {
    const c = fixture.cases[name];
    const res = await request(app)
      .post('/fhir/R4/$ai')
      .set(c.headers)
      .type(ContentType.FHIR_JSON)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'messages', valueString: '[]' }] });
    // Permitted callers reach the missing API key check
    expect(res).toHaveStatus(c.smartScoped ? 403 : 400);
  });
});
