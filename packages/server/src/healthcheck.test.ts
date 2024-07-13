import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config';
import * as otel from './otel/otel';

const app = express();

describe('Health check', () => {
  let setGaugeSpy: jest.SpyInstance;

  beforeEach(() => {
    setGaugeSpy = jest.spyOn(otel, 'setGauge');
  });

  afterEach(() => {
    setGaugeSpy.mockRestore();
  });

  test('Get /healthcheck', async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);

    await shutdownApp();
  });

  test('Get /healthcheck when OTel is enabled', async () => {
    const originalProcessEnv = process.env;
    process.env = { ...originalProcessEnv };
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    const config = await loadTestConfig();
    await initApp(app, config);

    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);

    expect(setGaugeSpy).toHaveBeenCalledTimes(10);

    await shutdownApp();
    process.env = originalProcessEnv;
  });

  test('Get /healthcheck when OTel is enabled and read and write instance are the same', async () => {
    const originalProcessEnv = process.env;
    process.env = { ...originalProcessEnv };
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    const config = await loadTestConfig();
    config.readonlyDatabase = undefined;
    await initApp(app, config);

    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);

    expect(setGaugeSpy).toHaveBeenCalledTimes(7);

    await shutdownApp();
    process.env = originalProcessEnv;
  });
});
