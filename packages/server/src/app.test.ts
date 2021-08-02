import express from 'express';
import request from 'supertest';
import { initApp } from './app';
import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';

const app = express();

beforeAll(async () => {
  const config = await loadTestConfig();
  await initDatabase(config.database);
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
