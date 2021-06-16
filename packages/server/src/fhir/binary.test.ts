import express from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { sep } from 'path';
import request from 'supertest';
import { initApp } from '../app';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initBinaryStorage } from './binary';

const app = express();
const binaryDir = mkdtempSync(tmpdir() + sep + 'binary-');

beforeAll(async () => {
  await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
  await initApp(app);
  await initBinaryStorage('file:' + binaryDir);
});

afterAll(async () => {
  await closeDatabase();
  rmSync(binaryDir, { recursive: true, force: true });
});

test('Create and read binary', (done) => {
  request(app)
    .post('/fhir/R4/Binary')
    .set('Content-Type', 'text/plain')
    .send('Hello world')
    .expect(201)
    .end((err, res) => {
      const binary = res.body;
      request(app)
        .get('/fhir/R4/Binary/' + binary.id)
        .expect(200, done);
    });
});

test('Read binary not found', (done) => {
  request(app)
    .get('/fhir/R4/Binary/2e9dfab6-a3af-4e5b-9324-483b4c333737')
    .expect(404, done);
});
