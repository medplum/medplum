import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../test.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();
let accessToken: string;

describe('ASTM Routes', () => {
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

  test('Send unauthenticated', async () => {
    const msg = 'DB';
    const res = await request(app).post(`/astm/v1`).set('Content-Type', 'text/plain').send(msg);
    expect(res.status).toBe(401);
  });

  test('Send success', async () => {
    const msg = 'DB';
    const res = await request(app)
      .post(`/astm/v1`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send(msg);
    expect(res.status).toBe(200);
  });
});
