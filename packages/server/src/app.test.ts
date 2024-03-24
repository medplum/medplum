import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { getConfig, loadTestConfig } from './config';
import { getDatabasePool } from './database';
import { globalLogger } from './logger';

describe('App', () => {
  test('Get HTTP config', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(await shutdownApp()).toBeUndefined();
  });

  test('Use /api/', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/api/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(await shutdownApp()).toBeUndefined();
  });

  test('Get HTTPS config', async () => {
    const app = express();
    const config = await loadTestConfig();
    getConfig().baseUrl = 'https://example.com/';
    await initApp(app, config);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(await shutdownApp()).toBeUndefined();
  });

  test('robots.txt', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toBe('User-agent: *\nDisallow: /');
    expect(await shutdownApp()).toBeUndefined();
  });

  test('No CORS', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/').set('Origin', 'https://blackhat.xyz');
    expect(res.status).toBe(200);
    expect(res.headers['origin']).toBeUndefined();
    expect(await shutdownApp()).toBeUndefined();
  });

  test('Internal Server Error', async () => {
    const app = express();
    app.get('/throw', () => {
      throw new Error('Catastrophe!');
    });
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/throw');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ msg: 'Internal Server Error' });
    expect(await shutdownApp()).toBeUndefined();
  });

  test('Database disconnect', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);

    const loggerError = jest.spyOn(globalLogger, 'error').mockReturnValueOnce();
    const error = new Error('Mock database disconnect');
    getDatabasePool().emit('error', error);
    expect(loggerError).toHaveBeenCalledWith('Database connection error', error);
    expect(await shutdownApp()).toBeUndefined();
  });

  test.skip('Preflight max age', async () => {
    const app = express();
    const res = await request(app).options('/');
    expect(res.status).toBe(204);
    expect(res.header['access-control-max-age']).toBe('86400');
    expect(res.header['cache-control']).toBe('public, max-age=86400');
  });
});
