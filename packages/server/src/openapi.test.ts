import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config';

const app = express();

describe('OpenAPI', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
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
