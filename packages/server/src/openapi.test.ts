import express from 'express';
import request from 'supertest';
import { initApp } from './app';
import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { initKeys } from './oauth';

const app = express();

describe('OpenAPI', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Get /openapi.json', async () => {
    const res = await request(app)
      .get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).not.toBeUndefined();
    expect(res.body.info).not.toBeUndefined();
  });

});
