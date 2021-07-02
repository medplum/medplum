import { OperationOutcome } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();
let accessToken: string;

beforeAll(async () => {
  const config = await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
  await seedDatabase();
  await initApp(app);
  await initKeys(config);
  accessToken = await initTestAuth();
});

afterAll(async () => {
  await closeDatabase();
});

test('Expand no system', (done) => {
  request(app)
    .get(`/fhir/R4/ValueSet/$expand`)
    .set('Authorization', 'Bearer ' + accessToken)
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('Missing url');
      done();
    });
});

test('Expand no filter', (done) => {
  request(app)
    .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('https://snomed.info/sct')}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('Missing filter');
      done();
    });
});

test('Expand success', (done) => {
  request(app)
    .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('https://snomed.info/sct')}&filter=left`)
    .set('Authorization', 'Bearer ' + accessToken)
    .end((err, res) => {
      expect(res.status).toBe(200);
      expect(res.body.expansion.contains.length).toBe(2);
      done();
    });
});

test('Expand success with count and offset', (done) => {
  request(app)
    .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('https://snomed.info/sct')}&filter=left&offset=1&count=1`)
    .set('Authorization', 'Bearer ' + accessToken)
    .end((err, res) => {
      expect(res.status).toBe(200);
      expect(res.body.expansion.offset).toBe(1);
      expect(res.body.expansion.contains.length).toBe(1);
      done();
    });
});
