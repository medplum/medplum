// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';

describe('OAuth2 UserInfo', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Token introspection', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.access_token).toBeDefined();
    const token = res2.body.access_token;

    const res3 = await request(app).post(`/oauth2/introspect`).send({ token });
    expect(res3.status).toBe(200);
    const result = res3.body;
    expect(result.active).toEqual(true);
    expect(result.iss).toBeDefined();
    expect(result.sub).toBeDefined();
  });

  test('Token introspection on revoked token', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.access_token).toBeDefined();
    const token = res2.body.access_token;

    const resLogout = await request(app)
      .post('/oauth2/logout')
      .set('Authorization', 'Bearer ' + token)
      .send();
    expect(resLogout.status).toBe(200);

    const res3 = await request(app).post(`/oauth2/introspect`).send({ token });
    expect(res3.status).toBe(200);
    expect(res3.body).toStrictEqual({ active: false });
  });

  test('Token parameter required', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.access_token).toBeDefined();
    const token = res2.body.access_token;

    const res3 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + token)
      .send({});
    expect(res3.status).toBe(400);
  });
});
