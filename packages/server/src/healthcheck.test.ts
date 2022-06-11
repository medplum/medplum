import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp } from './app';
import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { initKeys } from './oauth';
import { closeRedis, initRedis } from './redis';

vi.mock('ioredis');

const app = express();

describe('Health check', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initRedis(config.redis);
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
    await closeRedis();
  });

  test('Get /healthcheck', async () => {
    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);
  });
});
