import express from 'express';
import request from 'supertest';
import { initApp } from './app';
import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';

const app = express();

describe('App', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initApp(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Get root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

  test('Get healthcheck', async () => {
    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);
  });

});
