import express from 'express';
import request from 'supertest';
import { initApp } from './app';
import { getConfig, loadTestConfig } from './config';

describe('App', () => {
  test('Get HTTP config', async () => {
    const app = express();
    await loadTestConfig();
    await initApp(app);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('Get HTTPS config', async () => {
    const app = express();
    await loadTestConfig();
    getConfig().baseUrl = 'https://example.com/';
    await initApp(app);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  test('No CORS', async () => {
    const app = express();
    await loadTestConfig();
    await initApp(app);
    const res = await request(app).get('/').set('Origin', 'https://blackhat.xyz');
    expect(res.status).toBe(200);
    expect(res.headers['origin']).toBeUndefined();
  });

  test('Internal Server Error', async () => {
    const app = express();
    app.get('/throw', () => {
      throw new Error('Error');
    });
    await loadTestConfig();
    await initApp(app);
    const res = await request(app).get('/throw');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ msg: 'Internal Server Error' });
  });

  test.skip('Preflight max age', async () => {
    const app = express();
    const res = await request(app).options('/');
    expect(res.status).toBe(204);
    expect(res.header['access-control-max-age']).toBe('86400');
    expect(res.header['cache-control']).toBe('public, max-age=86400');
  });
});
