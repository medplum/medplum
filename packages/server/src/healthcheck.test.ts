// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import * as otel from './otel/otel';

const app = express();

describe('Health check', () => {
  let setGaugeSpy: jest.SpyInstance;
  const originalProcessEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalProcessEnv };
    setGaugeSpy = jest.spyOn(otel, 'setGauge');
  });

  afterEach(async () => {
    process.env = originalProcessEnv;
    setGaugeSpy.mockRestore();
    await shutdownApp();
  });

  test('Get /healthcheck', async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);
  });

  test('Get /healthcheck when OTel is enabled', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    const config = await loadTestConfig();
    await initApp(app, config);

    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);

    expect(setGaugeSpy).toHaveBeenCalledTimes(3);
  });

  test('Get /healthcheck when OTel is enabled and read and write instance are the same', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    const config = await loadTestConfig();
    config.readonlyDatabase = undefined;
    await initApp(app, config);

    const res = await request(app).get('/healthcheck');
    expect(res.status).toBe(200);

    expect(setGaugeSpy).toHaveBeenCalledTimes(2);
  });
});
