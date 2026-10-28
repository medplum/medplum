// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { ClientApplication, Login, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { parse as parseSetCookie } from 'set-cookie-parser';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { setPassword } from './setpassword';

describe('Login reason', () => {
  const app = express();
  const email = `reason${randomUUID()}@example.com`;
  const password = randomUUID();
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    await withTestContext(async () => {
      ({ project, client } = await createTestProject({
        withClient: true,
        project: { setting: [{ name: 'loginReasonRequired', valueBoolean: true }] },
      }));
      const { user } = await inviteUser({
        project,
        resourceType: 'Practitioner',
        firstName: 'Reason',
        lastName: 'Reason',
        email,
      });
      await setPassword(getGlobalSystemRepo(), user, password);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function setLoginReasonRequired(required: boolean): Promise<void> {
    await withTestContext(async () => {
      const systemRepo = getGlobalSystemRepo();
      project = await systemRepo.updateResource<Project>({
        ...(await systemRepo.readResource<Project>('Project', project.id)),
        setting: [{ name: 'loginReasonRequired', valueBoolean: required }],
      });
    });
  }

  function postLogin(): request.Test {
    return request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
      scope: 'openid offline_access',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
  }

  test('Requires a new reason for every login', async () => {
    const res1 = await postLogin();
    expect(res1).toHaveStatus(200);
    expect(res1.body).toMatchObject({ reasonRequired: true });
    expect(res1.body.code).toBeUndefined();
    const loginId = res1.body.login;

    // Token denied before a reason is entered
    const { code } = await withTestContext(() => getGlobalSystemRepo().readResource<Login>('Login', loginId));
    const tokenRequest = { grant_type: 'authorization_code', code, code_verifier: 'xyz' };
    const res2 = await request(app).post('/oauth2/token').type('form').send(tokenRequest);
    expect(res2).toHaveStatus(400);

    const res3 = await request(app).post('/auth/reason').type('json').send({ login: loginId, reason: '  ' });
    expect(res3).toHaveStatus(400);

    const res4 = await request(app).post('/auth/reason').type('json').send({ login: loginId, reason: 'Chart review' });
    expect(res4).toHaveStatus(200);
    expect(res4.body.code).toBe(code);

    const res5 = await request(app).post('/oauth2/token').type('form').send(tokenRequest);
    expect(res5).toHaveStatus(200);
    expect(res5.body.access_token).toBeDefined();
    expect(res5.body.refresh_token).toBeUndefined();

    const login = await withTestContext(() => getGlobalSystemRepo().readResource<Login>('Login', loginId));
    expect(login.reason).toBe('Chart review');

    // The session cookie cannot be reused to authorize without a new login
    const cookie = parseSetCookie(res4.headers['set-cookie'])[0];
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id,
      redirect_uri: client.redirectUris?.[0] as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      prompt: 'none',
    });
    const res6 = await request(app)
      .get('/oauth2/authorize?' + params.toString())
      .set('Cookie', cookie.name + '=' + cookie.value);
    expect(new URL(res6.headers.location).searchParams.get('error')).toBe('login_required');
  });

  test('Refresh denied for logins created before the setting was enabled', async () => {
    await setLoginReasonRequired(false);
    const res1 = await postLogin();
    const res2 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: res1.body.code, code_verifier: 'xyz' });
    expect(res2.body.refresh_token).toBeDefined();

    await setLoginReasonRequired(true);
    const res3 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: res2.body.refresh_token });
    expect(res3).toHaveStatus(400);
    expect(res3.body.issue[0].details.text).toBe('Login reason required');
  });
});
