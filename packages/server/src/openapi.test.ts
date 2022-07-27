import express from 'express';
import request from 'supertest';
import { initApp } from './app';
import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { initKeys } from './oauth';
import { closeRedis, initRedis } from './redis';

const app = express();

describe('OpenAPI', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
    closeRedis();
  });

  test('Get /openapi.json', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBeDefined();
    expect(res.body.info).toBeDefined();

    const patient = res.body.components.schemas.Patient;
    expect(patient).toBeDefined();
    expect(patient.properties.id).toBeDefined();
    expect(patient.properties.language).toBeDefined();
    expect(patient.properties._language).toBeUndefined();
  });
});
