import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config';

const app = express();

describe('Health check', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get /healthcheck', async () => {
    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);
  });
});
