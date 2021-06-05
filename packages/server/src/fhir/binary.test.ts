import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';

const app = express();

beforeAll(async () => {
  await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
  await initApp(app);
});

afterAll(async () => {
  await closeDatabase();
});

test('Read binary', (done) => {
  request(app)
    .get('/fhir/R4/Binary/2e9dfab6-a3af-4e5b-9324-483b4c333736')
    .expect(200, done);
});

test('Read binary not found', (done) => {
  request(app)
    .get('/fhir/R4/Binary/2e9dfab6-a3af-4e5b-9324-483b4c333737')
    .expect(404, done);
});
