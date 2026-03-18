// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { tryLogin } from '../oauth/utils';
import { addTestUser, createTestProject, withTestContext } from '../test.setup';
import { setPassword } from './setpassword';

const app = express();

describe('Revoke', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Unauthenticated', async () => {
    const res = await request(app).post('/auth/revoke').type('json').send({ loginId: randomUUID() });
    expect(res.status).toBe(401);
  });

  test('Revoke session', async () => {
    const email = `alex${randomUUID()}@example.com`;
    const password = randomUUID();

    const { accessToken } = await withTestContext(async () => {
      const { project } = await createTestProject();
      return addTestUser({ project, email, password, firstName: 'Alexander', lastName: 'Hamilton' });
    });

    // Get sessions 1st time
    // Should be 1 session
    const res1 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res1.status).toBe(200);
    expect(res1.body).toBeDefined();
    expect(res1.body.security.sessions).toHaveLength(1);
    const firstLoginId = res1.body.security.sessions[0].id;
    expect(firstLoginId).toBeTruthy();

    // Sign in again
    const login2 = await withTestContext(() =>
      tryLogin({
        authMethod: 'password',
        email,
        password,
        scope: 'openid',
        nonce: 'nonce',
      })
    );
    expect(login2).toBeDefined();

    // Get sessions 2nd time
    // Should be 2 sessions
    const res2 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toBeDefined();
    expect(res2.body.security.sessions).toHaveLength(2);
    expect(res2.body.security.sessions.find((s: any) => s.id === firstLoginId)).toBeTruthy();
    expect(res2.body.security.sessions.find((s: any) => s.id === login2.id)).toBeTruthy();

    // Revoke the 2nd session
    const res3 = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ loginId: login2.id });
    expect(res3.status).toBe(200);

    // Get sessions 3rd time
    // Should be 1 session
    const res4 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res4.status).toBe(200);
    expect(res4.body).toBeDefined();
    expect(res4.body.security.sessions).toHaveLength(1);
    expect(res4.body.security.sessions.find((s: any) => s.id === firstLoginId)).toBeTruthy();
    expect(res4.body.security.sessions.find((s: any) => s.id === login2.id)).toBeUndefined();

    // Try to revoke without a login
    // This should fail
    const res5 = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    expect(res5.status).toBe(400);

    // Try to revoke a random session
    // This should fail
    const res6 = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ loginId: randomUUID() });
    expect(res6.status).toBe(404);
  });

  test('Different user', async () => {
    const aliceEmail = `alice${randomUUID()}@example.com`;
    const alicePassword = randomUUID();
    const bobEmail = `bob${randomUUID()}@example.com`;
    const bobPassword = randomUUID();

    const { bobLogin, aliceAccessToken } = await withTestContext(async () => {
      const { project } = await createTestProject();
      const { accessToken: aliceAccessToken } = await addTestUser({
        project,
        email: aliceEmail,
        password: alicePassword,
        firstName: 'Alice',
        lastName: 'Smith',
      });

      // Second, Alice invites Bob to the project
      const { user } = await inviteUser({
        project,
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });

      // Set Bob password
      await setPassword(user, bobPassword);

      // Login as Bob
      const bobLogin = await tryLogin({
        authMethod: 'password',
        email: bobEmail,
        password: bobPassword,
        scope: 'openid',
        nonce: 'nonce',
      });
      expect(bobLogin).toBeDefined();
      return { bobLogin, aliceAccessToken };
    });

    // Try to revoke Bob's session as Alice
    // This should fail
    const revokeResponse = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${aliceAccessToken}`)
      .type('json')
      .send({ loginId: bobLogin.id });
    expect(revokeResponse.status).toBe(404);
  });
});
