// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, getReferenceString, OAuthGrantType } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getAuthTokens, tryLogin } from '../oauth/utils';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

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
    expect(res).toHaveStatus(401);
  });

  test('Revoke session', async () => {
    const email = `alex${randomUUID()}@example.com`;
    const password = randomUUID();

    const { login, accessToken, user, profile } = await withTestContext(() =>
      registerNew({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email,
        password,
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      })
    );

    // Get sessions 1st time
    // Should be 1 session
    const res1 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res1).toHaveStatus(200);
    expect(res1.body.security.sessions.map((s: any) => s.id)).toContainExactly([login.id]);

    // Sign in again, and redeem the login
    // Only a granted login is a session
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
    await withTestContext(() => getAuthTokens(user, login2, createReference(profile)));

    // Get sessions 2nd time
    // Should be 2 sessions
    const res2 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res2).toHaveStatus(200);
    expect(res2.body.security.sessions.map((s: any) => s.id)).toContainExactly([login.id, login2.id]);

    // Revoke the 2nd session
    const res3 = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ loginId: login2.id });
    expect(res3).toHaveStatus(200);

    // Get sessions 3rd time
    // Should be 1 session
    const res4 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res4).toHaveStatus(200);
    expect(res4.body.security.sessions.map((s: any) => s.id)).toContainExactly([login.id]);

    // Try to revoke without a login
    // This should fail
    const res5 = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    expect(res5).toHaveStatus(400);

    // Try to revoke a random session
    // This should fail
    const res6 = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ loginId: randomUUID() });
    expect(res6).toHaveStatus(404);
  });

  test('Different user', async () => {
    const aliceEmail = `alice${randomUUID()}@example.com`;
    const alicePassword = randomUUID();
    const bobEmail = `bob${randomUUID()}@example.com`;
    const bobPassword = randomUUID();

    const { aliceRegResult, bobRegResult, bobMembership } = await withTestContext(async () => {
      const aliceRegResult = await registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Revoke Project',
        email: aliceEmail,
        password: alicePassword,
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      });

      // Bob has his own project
      const bobRegResult = await registerNew({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: bobEmail,
        password: bobPassword,
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      });

      // Alice invites Bob to her project
      const { membership: bobMembership } = await inviteUser({
        project: aliceRegResult.project,
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
        sendEmail: false,
      });
      return { aliceRegResult, bobRegResult, bobMembership };
    });

    // Try to revoke Bob's session as Alice
    // This should fail
    const res1 = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${aliceRegResult.accessToken}`)
      .type('json')
      .send({ loginId: bobRegResult.login.id });
    expect(res1).toHaveStatus(404);

    // Get a token for Bob in Alice's project
    const res2 = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${aliceRegResult.accessToken}`)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(bobMembership))
      .type('json')
      .send({ clientId: aliceRegResult.client.id });
    expect(res2).toHaveStatus(200);

    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.PreAuthorizedCode,
      client_id: aliceRegResult.client.id,
      'pre-authorized_code': res2.body.preAuthorizedCode,
    });
    expect(res3).toHaveStatus(200);
    const bobToken2 = res3.body.access_token;

    // Sessions are limited to Alice's project
    const res4 = await request(app).get('/auth/me').set('Authorization', `Bearer ${bobToken2}`);
    expect(res4).toHaveStatus(200);
    expect(res4.body.security.sessions.map((s: { id: string }) => s.id)).not.toContain(bobRegResult.login.id);

    const res5 = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${bobToken2}`)
      .type('json')
      .send({ loginId: bobRegResult.login.id });
    expect(res5).toHaveStatus(404);

    // Bob's own login sees and revokes sessions in both projects
    const res6 = await request(app).get('/auth/me').set('Authorization', `Bearer ${bobRegResult.accessToken}`);
    expect(res6).toHaveStatus(200);
    const bobSessions: string[] = res6.body.security.sessions.map((s: { id: string }) => s.id);
    expect(bobSessions).toHaveLength(2);
    expect(bobSessions).toContain(bobRegResult.login.id);

    const res7 = await request(app)
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${bobRegResult.accessToken}`)
      .type('json')
      .send({ loginId: bobSessions.find((id) => id !== bobRegResult.login.id) });
    expect(res7).toHaveStatus(200);

    const res8 = await request(app).get('/auth/me').set('Authorization', `Bearer ${bobToken2}`);
    expect(res8).toHaveStatus(401);
  });
});
