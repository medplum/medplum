import express from 'express';
import request from 'supertest';
import { initApp } from './app';
import { getConfig, loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { closeRedis, initRedis } from './redis';

describe('App', () => {
  test('Get HTTP config', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initRedis(config.redis);
    await initApp(app);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    await closeDatabase();
    await closeRedis();
  });

  test('Get HTTPS config', async () => {
    const app = express();
    const config = await loadTestConfig();
    getConfig().baseUrl = 'https://example.com/';
    await initDatabase(config.database);
    await initRedis(config.redis);
    await initApp(app);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    await closeDatabase();
    await closeRedis();
  });

  test.skip('Preflight max age', async () => {
    const app = express();
    const res = await request(app).options('/');
    expect(res.status).toBe(204);
    expect(res.header['access-control-max-age']).toBe('86400');
    expect(res.header['cache-control']).toBe('public, max-age=86400');
  });
});
