import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { tryLogin } from '../oauth/utils';
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
    expect(res.status).toBe(401);
  });

  test('User configuration', async () => {
    const email = `alex${randomUUID()}@example.com`;
    const password = randomUUID();

    const { login, accessToken } = await registerNew({
      firstName: 'Alexander',
      lastName: 'Hamilton',
      projectName: 'Hamilton Project',
      email,
      password,
      remoteAddress: '5.5.5.5',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
    });

    // Get sessions 1st time
    // Should be 1 session
    const res1 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res1.status).toBe(200);
    expect(res1.body).toBeDefined();
    expect(res1.body.security.sessions).toHaveLength(1);
    expect(res1.body.security.sessions.find((s: any) => s.id === login.id)).toBeTruthy();

    // Sign in again
    const login2 = await tryLogin({
      authMethod: 'password',
      email,
      password,
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
    });
    expect(login2).toBeDefined();

    // Get sessions 2nd time
    // Should be 2 sessions
    const res2 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toBeDefined();
    expect(res2.body.security.sessions).toHaveLength(2);
    expect(res2.body.security.sessions.find((s: any) => s.id === login.id)).toBeTruthy();
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
    expect(res4.body.security.sessions.find((s: any) => s.id === login.id)).toBeTruthy();
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
});
