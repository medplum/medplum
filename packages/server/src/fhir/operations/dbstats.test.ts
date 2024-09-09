import { ContentType } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

describe('$db-stats', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res1 = await request(app)
      .post('/fhir/R4/$db-stats')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res1.status).toBe(200);
  });

  test('Access denied', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: false } });

    const res1 = await request(app)
      .post('/fhir/R4/$db-stats')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res1.status).toBe(403);
  });
});
