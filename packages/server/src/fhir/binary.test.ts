import express from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';
import request from 'supertest';
import { initApp } from '../app';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';
import { initBinaryStorage } from './binary';

const app = express();
const binaryDir = mkdtempSync(__dirname + sep + 'binary-');
let accessToken: string;

beforeAll(async () => {
  const config = await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
  await initApp(app);
  await initBinaryStorage('file:' + binaryDir);
  await initKeys(config);
  accessToken = await initTestAuth();
});

afterAll(async () => {
  await closeDatabase();
  rmSync(binaryDir, { recursive: true, force: true });
});

test('Create and read binary', (done) => {
  request(app)
    .post('/fhir/R4/Binary')
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', 'text/plain')
    .send('Hello world')
    .expect(201)
    .end((err, res) => {
      const binary = res.body;
      request(app)
        .get('/fhir/R4/Binary/' + binary.id)
        .set('Authorization', 'Bearer ' + accessToken)
        .expect(200, done);
    });
});

test('Read binary not found', (done) => {
  request(app)
    .get('/fhir/R4/Binary/2e9dfab6-a3af-4e5b-9324-483b4c333737')
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(404, done);
});

test('Update and read binary', (done) => {
  request(app)
    .put('/fhir/R4/Binary/4c57f787-dca0-411f-bfe2-322800208286')
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', 'text/plain')
    .send('Hello world')
    .expect(201)
    .end((err, res) => {
      const binary = res.body;
      request(app)
        .get('/fhir/R4/Binary/' + binary.id)
        .set('Authorization', 'Bearer ' + accessToken)
        .expect(200, done);
    });
});
