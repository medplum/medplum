import express from 'express';
import request from 'supertest';
import { initApp } from './app';
import { loadConfig } from './config';
import { closeDatabase, initDatabase, TEST_CONFIG } from './database';

const app = express();

beforeAll(async () => {
  await loadConfig('file:medplum.config.json');
  await initDatabase(TEST_CONFIG);
  await initApp(app);
});

afterAll(async () => {
  await closeDatabase();
});

test('Get root', (done) => {
  request(app)
    .get('/')
    .expect(200, done);
});

test('Get healthcheck', (done) => {
  request(app)
    .get('/healthcheck')
    .expect(200, done);
});
