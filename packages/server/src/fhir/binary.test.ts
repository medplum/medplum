import express from 'express';
import request from 'supertest';
import { destroyApp, initApp } from '../app';

const app = express();

beforeAll(async () => {
  await initApp(app);
});

afterAll(async () => {
  await destroyApp(app);
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
