// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { WithId } from '@medplum/core';
import { ContentType, createReference, getReferenceString, Operator } from '@medplum/core';
import type { ContactPoint, Parameters, Practitioner, Project, User, UserSecurityRequest } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { inviteUser } from '../../admin/invite';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getAuthTokens, tryLogin } from '../../oauth/utils';
import { createTestProject, getSuperAdminTestProject } from '../../test.setup';
import type { Repository } from '../repo';

describe('User/$update-email', () => {
  const app = express();
  let repo: Repository;
  let project: WithId<Project>;
  let accessToken: string;
  let mockSESv2Client: AwsClientStub<SESv2Client>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.emailProvider = 'awsses';
    await initApp(app, config);

    ({ project, accessToken, repo } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
      withRepo: true,
    }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    mockSESv2Client = mockClient(SESv2Client);
    mockSESv2Client.on(SendEmailCommand).resolves({ MessageId: 'ID_TEST_123' });
  });

  afterEach(() => {
    mockSESv2Client.restore();
  });

  async function inviteTestUser(): Promise<WithId<User>> {
    const { user } = await inviteUser({
      project,
      email: `user+${randomUUID()}@example.com`,
      password: randomUUID(),
      sendEmail: false,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      scope: 'project',
    });
    return user;
  }

  async function findVerifyEmailRequest(user: WithId<User>): Promise<UserSecurityRequest | undefined> {
    const requests = await repo.searchResources<UserSecurityRequest>({
      resourceType: 'UserSecurityRequest',
      filters: [{ code: 'user', operator: Operator.EQUALS, value: getReferenceString(user) }],
    });
    return requests.find((r) => r.type === 'verify-email');
  }

  test('Updates user email and profile email', async () => {
    const email = `user+${randomUUID()}@example.com`;
    const password = randomUUID();
    const { user } = await inviteUser({
      project,
      email,
      password,
      sendEmail: false,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      scope: 'project',
    });

    const newEmail = `user+${randomUUID()}@example.com`;
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'email', valueString: newEmail },
          { name: 'skipEmailVerification', valueBoolean: true },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(200);
    const updated = res.body as User;
    expect(updated.email).toStrictEqual(newEmail);
  });

  test('Updates profile email if flag set', async () => {
    const email = `user+${randomUUID()}@example.com`;
    const password = randomUUID();
    const { user, profile } = await inviteUser({
      project,
      email,
      password,
      sendEmail: false,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      scope: 'project',
    });

    const newEmail = `user+${randomUUID()}@example.com`;
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'email', valueString: newEmail },
          { name: 'updateProfileTelecom', valueBoolean: true },
          { name: 'skipEmailVerification', valueBoolean: true },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(200);
    const updated = res.body as User;

    expect(updated.email).toStrictEqual(newEmail);

    const practitioner = await repo.readResource<Practitioner>('Practitioner', profile.id);
    expect(practitioner.telecom).toStrictEqual(
      expect.arrayContaining<ContactPoint>([
        { use: 'old', system: 'email', value: email },
        { use: 'work', system: 'email', value: newEmail },
      ])
    );
  });

  test('Requires admin privileges', async () => {
    const email = `user+${randomUUID()}@example.com`;
    const password = randomUUID();
    const { user, profile } = await inviteUser({
      project,
      email,
      password,
      sendEmail: false,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      scope: 'project',
    });

    // Log in as non-admin user
    const login = await tryLogin({
      email,
      password,
      projectId: project.id,
      authMethod: 'password',
      scope: 'openid *.*',
      nonce: randomUUID(),
    });
    const { accessToken } = await getAuthTokens(user, login, createReference(profile));

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'email', valueString: `user+${randomUUID()}@example.com` },
          { name: 'updateProfileTelecom', valueBoolean: true },
          { name: 'skipEmailVerification', valueBoolean: true },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(403);
  });

  test('Requires Project-scoped user', async () => {
    const email = `user+${randomUUID()}@example.com`;
    const password = randomUUID();
    const { user } = await inviteUser({
      project,
      email,
      password,
      sendEmail: false,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      scope: 'server',
    });

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'email', valueString: `user+${randomUUID()}@example.com` },
          { name: 'updateProfileTelecom', valueBoolean: true },
          { name: 'skipEmailVerification', valueBoolean: true },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(403);
  });

  test('Cannot alter user from other Project', async () => {
    const { project: otherProject } = await createTestProject();
    const email = `user+${randomUUID()}@example.com`;
    const password = randomUUID();
    const { user } = await inviteUser({
      project: otherProject,
      email,
      password,
      sendEmail: false,
      resourceType: 'Practitioner',
      firstName: 'Other',
      lastName: 'User',
      scope: 'project',
    });

    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'email', valueString: `user+${randomUUID()}@example.com` },
          { name: 'updateProfileTelecom', valueBoolean: true },
          { name: 'skipEmailVerification', valueBoolean: true },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(403);
  });

  test('Permitted for Super Admin', async () => {
    const email = `user+${randomUUID()}@example.com`;
    const password = randomUUID();
    const { user, profile } = await inviteUser({
      project,
      email,
      password,
      sendEmail: false,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      scope: 'project',
    });

    // User Super Admin to call operation
    const { accessToken: superAdminToken } = await getSuperAdminTestProject();

    const newEmail = `user+${randomUUID()}@example.com`;
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + superAdminToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'email', valueString: newEmail },
          { name: 'updateProfileTelecom', valueBoolean: true },
          { name: 'skipEmailVerification', valueBoolean: true },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(200);
    const updated = res.body as User;

    expect(updated.email).toStrictEqual(newEmail);

    const practitioner = await repo.readResource<Practitioner>('Practitioner', profile.id);
    expect(practitioner.telecom).toStrictEqual(
      expect.arrayContaining<ContactPoint>([
        { use: 'old', system: 'email', value: email },
        { use: 'work', system: 'email', value: newEmail },
      ])
    );
  });

  test('Sends verification email by default', async () => {
    const user = await inviteTestUser();
    const newEmail = `user+${randomUUID()}@example.com`;
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'email', valueString: newEmail }],
      } satisfies Parameters);
    expect(res).toHaveStatus(200);
    expect((res.body as User).emailVerified).toBe(false);

    const securityRequest = await findVerifyEmailRequest(user);
    expect(securityRequest).toBeDefined();
    expect(securityRequest?.used).toBeFalsy();

    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);
    const input = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(input.Destination?.ToAddresses).toStrictEqual([newEmail]);
  });

  test('Creates verification request without sending email when sendEmail is false', async () => {
    const user = await inviteTestUser();
    const newEmail = `user+${randomUUID()}@example.com`;
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'email', valueString: newEmail },
          { name: 'sendEmail', valueBoolean: false },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(200);
    expect((res.body as User).emailVerified).toBe(false);

    const securityRequest = await findVerifyEmailRequest(user);
    expect(securityRequest).toBeDefined();
    expect(securityRequest?.used).toBeFalsy();

    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Skips verification request entirely when skipEmailVerification is true', async () => {
    const user = await inviteTestUser();
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'email', valueString: `user+${randomUUID()}@example.com` },
          { name: 'skipEmailVerification', valueBoolean: true },
          { name: 'sendEmail', valueBoolean: false },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(200);

    expect(await findVerifyEmailRequest(user)).toBeUndefined();
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });
});
