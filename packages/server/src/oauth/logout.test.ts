import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { withTestContext } from '../test.setup';

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
    const res = await request(app).post('/oauth2/logout').type('json').send({});
    expect(res.status).toBe(401);
  });

  test('Success', async () => {
    const email = `alex${randomUUID()}@example.com`;
    const password = randomUUID();

    const { accessToken } = await withTestContext(() =>
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

    // Get user info (should succeed)
    const res1 = await request(app).get('/oauth2/userinfo').set('Authorization', `Bearer ${accessToken}`);
    expect(res1.status).toBe(200);

    // Logout (should succeed)
    const res2 = await request(app)
      .post('/oauth2/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    expect(res2.status).toBe(200);

    // Get user info (should fail)
    const res3 = await request(app).get('/oauth2/userinfo').set('Authorization', `Bearer ${accessToken}`);
    expect(res3.status).toBe(401);

    // Logout (should fail)
    const res4 = await request(app)
      .post('/oauth2/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    expect(res4.status).toBe(401);
  });
});
