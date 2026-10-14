// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { ClientApplication, Project } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { setPassword } from '../auth/setpassword';
import { loadTestConfig } from '../config/loader';
import type { SystemRepository } from '../fhir/repo';
import { getProjectSystemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';

describe('Project.active', () => {
  const app = express();
  const email = `project-active-${randomUUID()}@example.com`;
  const password = randomUUID();
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;
  let adminAccessToken: string;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    ({
      project,
      client,
      accessToken: adminAccessToken,
    } = await createTestProject({ withClient: true, withAccessToken: true, membership: { admin: true } }));
    systemRepo = await getProjectSystemRepo(project);

    const { user } = await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Active',
      lastName: 'Test',
      email,
    });
    await setPassword(systemRepo, user, password);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  afterEach(async () => {
    await setProjectActive(true);
  });

  async function setProjectActive(active: boolean): Promise<void> {
    const current = await systemRepo.readResource<Project>('Project', project.id);
    project = await systemRepo.updateResource<Project>({ ...current, active });
  }

  async function login(loginEmail = email): Promise<request.Response> {
    return request(app).post('/auth/login').type('json').send({
      email: loginEmail,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
      scope: 'openid offline_access',
    });
  }

  test('Existing access tokens stop working until the project is reactivated', async () => {
    await setProjectActive(false);
    const res1 = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + adminAccessToken);
    expect(res1).toHaveStatus(401);

    await setProjectActive(true);
    const res2 = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + adminAccessToken);
    expect(res2).toHaveStatus(200);
  });

  test('Basic auth rejected', async () => {
    await setProjectActive(false);
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res).toHaveStatus(401);
  });

  test('Client credentials rejected', async () => {
    await setProjectActive(false);
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res).toHaveStatus(400);
    expect(res.body.error).toBe('access_denied');
    expect(res.body.error_description).toBe('Project not active');
  });

  test('Password login rejected', async () => {
    await setProjectActive(false);
    const res = await login();
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Project not active');
  });

  test('Refresh token rejected', async () => {
    const res1 = await login();
    expect(res1).toHaveStatus(200);
    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res1.body.code,
      code_verifier: 'xyz',
    });
    expect(res2).toHaveStatus(200);

    await setProjectActive(false);
    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res3).toHaveStatus(400);
    expect(res3.body.error).toBe('access_denied');
    expect(res3.body.error_description).toBe('Project not active');
  });

  test('Project picker hides inactive projects', async () => {
    const pickerEmail = `project-picker-${randomUUID()}@example.com`;
    const { project: otherProject } = await createTestProject();
    const { user } = await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'A',
      lastName: 'B',
      email: pickerEmail,
    });
    await inviteUser({
      project: otherProject,
      resourceType: 'Practitioner',
      firstName: 'A',
      lastName: 'B',
      email: pickerEmail,
    });
    await setPassword(systemRepo, user, password);

    const res1 = await login(pickerEmail);
    expect(res1).toHaveStatus(200);
    expect(res1.body.memberships).toHaveLength(2);

    // With one active project left, it is chosen without prompting
    await setProjectActive(false);
    const res2 = await login(pickerEmail);
    expect(res2).toHaveStatus(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Project admins cannot change active', async () => {
    const res = await request(app)
      .put('/fhir/R4/Project/' + project.id)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .send({ ...project, active: false });
    expect(res).toHaveStatus(200);
    expect(res.body.active).toBe(true);
  });
});
