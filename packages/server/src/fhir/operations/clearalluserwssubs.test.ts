// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Parameters } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getCacheRedis, getPubSubRedis } from '../../redis';
import { initTestAuth } from '../../test.setup';

describe('$clearuserwssubs', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Access denied for non-superadmin', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: false } });

    const res = await request(app)
      .post('/fhir/R4/$clearuserwssubs')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'userRef', valueReference: { reference: 'Practitioner/test' } }],
      });
    expect(res.status).toBe(403);
  });

  test('Returns deleted=0 when user has no active set', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });
    const userRef = `Practitioner/${randomUUID()}`;

    const res = await request(app)
      .post('/fhir/R4/$clearuserwssubs')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'userRef', valueReference: { reference: userRef } }],
      });
    expect(res.status).toBe(200);

    const params = res.body as Parameters;
    const deleted = params.parameter?.find((p) => p.name === 'deleted')?.valueInteger;
    expect(deleted).toBe(0);
  });

  test('Deletes user active set and returns deleted=1', async () => {
    const pubSubRedis = getPubSubRedis();
    const userRef = `Practitioner/${randomUUID()}`;
    const userKey = `medplum:subscriptions:r4:user:${userRef}:active`;

    await pubSubRedis.sadd(userKey, 'Subscription/sub-1', 'Subscription/sub-2');

    // Verify key exists before clear
    expect(await pubSubRedis.exists(userKey)).toBe(1);

    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res = await request(app)
      .post('/fhir/R4/$clearuserwssubs')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'userRef', valueReference: { reference: userRef } }],
      });
    expect(res.status).toBe(200);

    const params = res.body as Parameters;
    const deleted = params.parameter?.find((p) => p.name === 'deleted')?.valueInteger;
    expect(deleted).toBe(1);

    // Key should be gone
    expect(await pubSubRedis.exists(userKey)).toBe(0);
  });

  test('removeFromActive also hdels entries from project active hashes', async () => {
    const pubSubRedis = getPubSubRedis();
    const cacheRedis = getCacheRedis();
    const userRef = `Practitioner/${randomUUID()}`;
    const projectId = randomUUID();
    const userKey = `medplum:subscriptions:r4:user:${userRef}:active`;
    const activeHashKey = `medplum:subscriptions:r4:project:${projectId}:active:Observation`;

    const subInHashId = randomUUID();
    const subNotInHashId = randomUUID();
    const subInHashRef = `Subscription/${subInHashId}`;
    const subNotInHashRef = `Subscription/${subNotInHashId}`;

    await pubSubRedis.sadd(userKey, subInHashRef, subNotInHashRef);
    await pubSubRedis.hset(activeHashKey, subInHashRef, 'Observation');

    const makeCacheEntry = (id: string): string =>
      JSON.stringify({
        resourceType: 'Subscription',
        resource: {
          resourceType: 'Subscription',
          id,
          criteria: 'Observation',
          channel: { type: 'websocket' },
          status: 'active',
          meta: { project: projectId },
        },
        projectId,
        lastUpdated: new Date().toISOString(),
      });

    await cacheRedis.set(subInHashRef, makeCacheEntry(subInHashId));
    await cacheRedis.set(subNotInHashRef, makeCacheEntry(subNotInHashId));

    try {
      const accessToken = await initTestAuth({ project: { superAdmin: true } });

      const res = await request(app)
        .post('/fhir/R4/$clearuserwssubs')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'userRef', valueReference: { reference: userRef } },
            { name: 'removeFromActive', valueBoolean: true },
          ],
        });
      expect(res.status).toBe(200);

      // User active set deleted
      expect(await pubSubRedis.exists(userKey)).toBe(0);
      // Entry that was in the project hash should be removed
      expect(await pubSubRedis.hexists(activeHashKey, subInHashRef)).toBe(0);
    } finally {
      await pubSubRedis.del(userKey, activeHashKey);
      await cacheRedis.del(subInHashRef, subNotInHashRef);
    }
  });
});
