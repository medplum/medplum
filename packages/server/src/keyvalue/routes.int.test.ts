// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import { MAX_ITEMS } from './store';

describe('Key Value Routes', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    // First, Alice creates a project
    const registration = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });
    accessToken = registration.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Set and get', async () => {
    const key = randomUUID();
    const value = randomUUID();

    const res1 = await request(app)
      .put(`/keyvalue/v1/${key}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('text/plain')
      .send(value);
    expect(res1.status).toBe(204);

    const res2 = await request(app)
      .get(`/keyvalue/v1/${key}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    expect(res2.text).toBe(value);

    const res3 = await request(app)
      .delete(`/keyvalue/v1/${key}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(204);

    const res4 = await request(app)
      .get(`/keyvalue/v1/${key}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(404);
  });

  test('Key too long', async () => {
    const key = 'a'.repeat(2048);

    const res1 = await request(app)
      .put(`/keyvalue/v1/${key}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('text/plain')
      .send('value');
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .get(`/keyvalue/v1/${key}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(400);

    const res3 = await request(app)
      .delete(`/keyvalue/v1/${key}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(400);
  });

  test('Invalid key', async () => {
    const res1 = await request(app)
      .get('/keyvalue/v1/key+with+spaces')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .get('/keyvalue/v1/key:with:colons')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(400);
  });

  test('Invalid body', async () => {
    const res1 = await request(app)
      .put(`/keyvalue/v1/json`)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({ foo: 'bar' });
    expect(res1.status).toBe(400);
  });

  test('Body too long', async () => {
    const res1 = await request(app)
      .put(`/keyvalue/v1/json`)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('text/plain')
      .send('a'.repeat(10000));
    expect(res1.status).toBe(400);
  });

  test('Max items', async () => {
    for (let i = 0; i <= MAX_ITEMS; i++) {
      const res1 = await request(app)
        .put(`/keyvalue/v1/my-key-${i}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .type('text/plain')
        .send(`my-value-${i}`);

      if (i < MAX_ITEMS) {
        expect(res1.status).toBe(204);
      } else {
        expect(res1.status).toBe(400);
      }
    }
  });
});
