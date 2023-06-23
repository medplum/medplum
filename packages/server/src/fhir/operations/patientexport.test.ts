import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();

describe('Patient export', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Accepted with GET', async () => {
    const accessToken = await initTestAuth();

    // Start the export
    const initRes = await request(app)
      .get('/fhir/R4/Patient/$export')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({});
    expect(initRes.status).toBe(202);
    expect(initRes.headers['content-location']).toBeDefined();
  });
});
