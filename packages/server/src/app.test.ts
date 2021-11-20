import express from 'express';
import request from 'supertest';
import { initApp } from './app';
import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { closeRedis, initRedis } from './redis';

const app = express();

describe('App', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initRedis(config.redis);
    await initApp(app);
  });

  afterAll(async () => {
    await closeDatabase();
    await closeRedis();
  });

  test('Get root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

});
