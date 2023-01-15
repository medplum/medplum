import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { initTestAuth } from '../test.setup';

const app = express();
let accessToken: string;

describe('SCIM Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Search users', async () => {
    const res = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Create user', async () => {
    const res = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(200);
  });

  test('Read user', async () => {
    const res = await request(app)
      .get(`/scim/v2/Users/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Update user', async () => {
    const res = await request(app)
      .put(`/scim/v2/Users/123`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(200);
  });

  test('Delete user', async () => {
    const res = await request(app)
      .delete(`/scim/v2/Users/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Patch user', async () => {
    const res = await request(app)
      .patch(`/scim/v2/Users/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });
});
