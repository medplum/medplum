// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express from 'express';
import type { PoolClient } from 'pg';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import { DatabaseMode, getDatabasePool } from './database';
import * as otel from './otel/otel';

const app = express();

describe('Health check', () => {
  let setGaugeSpy: MockInstance;
  const originalProcessEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalProcessEnv };
    setGaugeSpy = vi.spyOn(otel, 'setGauge');
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
    expect(res).toHaveStatus(200);
    expect(res.body.redis).toBe(true);
    expect(res.body.redisInstances).toEqual({
      default: true,
      rateLimit: true,
      pubSub: true,
      backgroundJobs: true,
    });
  });

  test('Get /healthcheck with separate Redis instances', async () => {
    const config = await loadTestConfig();
    config.cacheRedis = { ...config.redis, db: 11 };
    await initApp(app, config);

    const res = await request(app).get('/healthcheck');
    expect(res).toHaveStatus(200);
    expect(res.body.redisInstances).toMatchObject({
      default: true,
      cache: true,
      rateLimit: true,
      pubSub: true,
      backgroundJobs: true,
    });
  });

  test('Get /healthcheck when OTel is enabled', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    const config = await loadTestConfig();
    await initApp(app, config);

    const res = await request(app).get('/healthcheck');
    expect(res).toHaveStatus(200);

    expect(setGaugeSpy).toHaveBeenCalledTimes(6);
  });

  test('Get /healthcheck when OTel is enabled and read and write instance are the same', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    const config = await loadTestConfig();
    config.readonlyDatabase = undefined;
    await initApp(app, config);

    const res = await request(app).get('/healthcheck');
    expect(res).toHaveStatus(200);

    expect(setGaugeSpy).toHaveBeenCalledTimes(5);
  });

  test('Recovers after the reserved connection is terminated', async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    const pool = getDatabasePool(DatabaseMode.WRITER);
    const connectSpy = vi.spyOn(pool, 'connect');

    const res1 = await request(app).get('/healthcheck');
    expect(res1).toHaveStatus(200);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    // Kill the reserved connection from the server side, as a proxy restart or network drop would
    const reserved = (await connectSpy.mock.results[0].value) as PoolClient;
    const pid = (await reserved.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const errorEvent = new Promise((resolve) => {
      reserved.once('error', resolve);
    });
    await pool.query('SELECT pg_terminate_backend($1)', [pid]);
    await errorEvent;
    connectSpy.mockClear();

    const res2 = await request(app).get('/healthcheck');
    expect(res2).toHaveStatus(200);
    expect(res2.body.postgres).toBe(true);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  test('Retries on a fresh connection when the reserved connection is not queryable', async () => {
    const config = await loadTestConfig();
    config.readonlyDatabase = undefined;
    await initApp(app, config);

    const deadClient = {
      query: vi.fn().mockRejectedValue(new Error('Client has encountered a connection error and is not queryable')),
      release: vi.fn(),
      on: vi.fn(),
    };
    const pool = getDatabasePool(DatabaseMode.WRITER);
    const connectSpy = vi.spyOn(pool, 'connect').mockResolvedValueOnce(deadClient as unknown as never);

    const [res1, res2] = await Promise.all([request(app).get('/healthcheck'), request(app).get('/healthcheck')]);
    expect(res1).toHaveStatus(200);
    expect(res2).toHaveStatus(200);
    expect(deadClient.release).toHaveBeenCalledTimes(1);
    expect(deadClient.release).toHaveBeenCalledWith(true);

    // One reservation for the dead client, one shared replacement for both concurrent checks
    expect(connectSpy).toHaveBeenCalledTimes(2);
  });

  test('Fails when the database is unavailable, then recovers', async () => {
    const config = await loadTestConfig();
    config.readonlyDatabase = undefined;
    await initApp(app, config);

    const pool = getDatabasePool(DatabaseMode.WRITER);
    const connectSpy = vi
      .spyOn(pool, 'connect')
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const res1 = await request(app).get('/healthcheck');
    expect(res1).toHaveStatus(500);

    const res2 = await request(app).get('/healthcheck');
    expect(res2).toHaveStatus(200);
    expect(connectSpy).toHaveBeenCalledTimes(3);
  });
});
