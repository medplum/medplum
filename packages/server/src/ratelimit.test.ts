// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express from 'express';
import request from 'supertest';
import { loadTestConfig } from './config/loader';
import { attachRequestContext } from './context';
import { categories, closeRateLimiter, rateLimitHandler } from './ratelimit';
import { closeRedis, getRateLimitRedis, initRedis } from './redis';
import type { TestRedisConfig } from './test.setup';
import { deleteRedisKeys } from './test.setup';

describe('Rate limit categories', () => {
  // Request paths are lowercased before matching, so a mixed-case path would never match
  test.each(
    categories.map((c) => [
      c.name,
      [...(c.paths ?? []), ...(c.prefixes ?? []), ...(c.excludedPaths ?? []), ...(c.refundOnSuccessPaths ?? [])],
    ])
  )(
    '%s paths are lowercase',
    (_name, paths) => {
      for (const path of paths) {
        expect(path).toBe(path.toLowerCase());
      }
    }
  );
});

describe('Rate limit refunds', () => {
  const app = express();
  let rateLimitRedisConfig: TestRedisConfig;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.defaultRateLimit = 100;
    config.defaultLoginRateLimit = 1;
    rateLimitRedisConfig = config.rateLimitRedis as TestRedisConfig;
    rateLimitRedisConfig.keyPrefix = 'rate-limit-refund:';
    initRedis(config);

    app.use(attachRequestContext);
    app.use(rateLimitHandler(config));
    // Stub endpoints: respond with the status requested by the test
    app.post(['/auth/login', '/auth/newuser'], (req, res) => {
      res.status(Number(req.query.status)).end();
    });
  });

  afterEach(async () => {
    await deleteRedisKeys(getRateLimitRedis(), rateLimitRedisConfig.keyPrefix);
  });

  afterAll(async () => {
    closeRateLimiter();
    await closeRedis();
  });

  test('Successful login does not consume login quota', async () => {
    expect(await request(app).post('/auth/login?status=200')).toHaveStatus(200);
    expect(await request(app).post('/Auth/Login/?status=200')).toHaveStatus(200);
    expect(await request(app).post('/auth/login?status=400')).toHaveStatus(400);
    expect(await request(app).post('/auth/login?status=200')).toHaveStatus(429);
  });

  test('Successful account creation still consumes login quota', async () => {
    expect(await request(app).post('/auth/newuser?status=200')).toHaveStatus(200);
    expect(await request(app).post('/auth/login?status=200')).toHaveStatus(429);
  });
});
