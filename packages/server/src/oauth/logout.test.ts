// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject } from '../test.setup';

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
    const { accessToken } = await createTestProject({ withAccessToken: true });

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
