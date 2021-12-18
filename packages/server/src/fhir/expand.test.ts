import { OperationOutcome } from '@medplum/fhirtypes';
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

describe('Expand', () => {
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

  test('No system', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('Missing url');
  });

  test('No filter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('https://snomed.info/sct')}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('Missing filter');
  });

  test('Success', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('https://snomed.info/sct')}&filter=left`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.contains.length).toBe(2);
  });

  test('Success with count and offset', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('https://snomed.info/sct')}&filter=left&offset=1&count=1`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.offset).toBe(1);
    expect(res.body.expansion.contains.length).toBe(1);
  });
});
