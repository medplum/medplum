// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, WithId } from '@medplum/core';
import { ContactPoint, Parameters, Practitioner, Project, User } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { inviteUser } from '../../admin/invite';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getAuthTokens, tryLogin } from '../../oauth/utils';
import { createTestProject } from '../../test.setup';
import { Repository } from '../repo';

describe('User/$update-email', () => {
  const app = express();
  let repo: Repository;
  let project: WithId<Project>;
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
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
    expect(res.status).toBe(200);
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
    expect(res.status).toBe(200);
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
    expect(res.status).toBe(403);
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
    expect(res.status).toBe(403);
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
    expect(res.status).toBe(403);
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
    const { accessToken: superAdminToken } = await createTestProject({
      withAccessToken: true,
      project: { superAdmin: true },
    });

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
    expect(res.status).toBe(200);
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
});
