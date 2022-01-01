import express from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';
import { initBinaryStorage } from './storage';

const app = express();
const binaryDir = mkdtempSync(__dirname + sep + 'binary-');
let accessToken: string;

describe('Binary', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initBinaryStorage('file:' + binaryDir);
    await initKeys(config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await closeDatabase();
    rmSync(binaryDir, { recursive: true, force: true });
  });

  test.skip('Payload too large', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Binary`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/octet-stream')
      .send('a'.repeat(11 * 1024 * 1024));
    expect(res.status).toBe(400);
  });

  test('Create and read binary', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('Hello world');
    expect(res.status).toBe(201);

    const binary = res.body;
    const res2 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
  });

  test('Read binary not found', async () => {
    const res = await request(app)
      .get('/fhir/R4/Binary/2e9dfab6-a3af-4e5b-9324-483b4c333737')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Update and read binary', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('Hello world');
    expect(res.status).toBe(201);

    const binary = res.body;
    const res2 = await request(app)
      .put('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('Hello world 2');
    expect(res2.status).toBe(200);

    const res3 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
  });

  test('Binary CORS', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .set('Origin', 'https://www.example.com')
      .send('Hello world');
    expect(res.status).toBe(201);
    expect(res.headers['access-control-allow-origin']).toBe('https://www.example.com');
  });
});
