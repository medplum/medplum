import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();
let accessToken: string;

describe('SCIM Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await closeDatabase();
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
