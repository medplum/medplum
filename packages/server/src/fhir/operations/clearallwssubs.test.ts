// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getCacheRedis, getPubSubRedis } from '../../redis';
import { initTestAuth } from '../../test.setup';

describe('$clear-all-ws-subs', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Access denied for non-super-admin', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: false } });

    const res = await request(app)
      .post('/fhir/R4/$clear-all-ws-subs')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(403);
  });

  test('Rejects invalid projectId', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res = await request(app)
      .post('/fhir/R4/$clear-all-ws-subs')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'projectId', valueString: 'not-a-uuid' }],
      });

    expect(res.status).toBe(400);
  });

  test('Clears all WS subscription hashes, cache entries, and user keys', async () => {
    const pubSubRedis = getPubSubRedis();
    const cacheRedis = getCacheRedis();
    const projectId = randomUUID();
    const sub1Id = randomUUID();
    const sub2Id = randomUUID();
    const userId = randomUUID();
    const userKey = `medplum:subscriptions:r4:user:Practitioner/${userId}:active`;

    await pubSubRedis.hset(
      `medplum:subscriptions:r4:project:${projectId}:active:Observation`,
      `Subscription/${sub1Id}`,
      'Observation?code=85354-9'
    );
    await pubSubRedis.hset(
      `medplum:subscriptions:r4:project:${projectId}:active:Patient`,
      `Subscription/${sub2Id}`,
      'Patient?name=Alice'
    );
    await cacheRedis.set(`Subscription/${sub1Id}`, JSON.stringify({ id: sub1Id }));
    await cacheRedis.set(`Subscription/${sub2Id}`, JSON.stringify({ id: sub2Id }));
    await pubSubRedis.sadd(userKey, `Subscription/${sub1Id}`, `Subscription/${sub2Id}`);

    expect(await pubSubRedis.exists(`medplum:subscriptions:r4:project:${projectId}:active:Observation`)).toBe(1);
    expect(await pubSubRedis.exists(`medplum:subscriptions:r4:project:${projectId}:active:Patient`)).toBe(1);
    expect(await cacheRedis.exists(`Subscription/${sub1Id}`)).toBe(1);
    expect(await cacheRedis.exists(`Subscription/${sub2Id}`)).toBe(1);
    expect(await pubSubRedis.scard(userKey)).toBe(2);

    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res = await request(app)
      .post('/fhir/R4/$clear-all-ws-subs')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(200);

    expect(await pubSubRedis.exists(`medplum:subscriptions:r4:project:${projectId}:active:Observation`)).toBe(0);
    expect(await pubSubRedis.exists(`medplum:subscriptions:r4:project:${projectId}:active:Patient`)).toBe(0);
    expect(await cacheRedis.exists(`Subscription/${sub1Id}`)).toBe(0);
    expect(await cacheRedis.exists(`Subscription/${sub2Id}`)).toBe(0);
    expect(await pubSubRedis.exists(userKey)).toBe(0);
  });

  test('Clears WS subscription hashes, cache entries, and user keys for a specific project only', async () => {
    const pubSubRedis = getPubSubRedis();
    const cacheRedis = getCacheRedis();
    const projectId1 = randomUUID();
    const projectId2 = randomUUID();
    const sub1Id = randomUUID();
    const sub2Id = randomUUID();
    const userId = randomUUID();
    const authorRef = `Practitioner/${userId}`;
    const userKey = `medplum:subscriptions:r4:user:${authorRef}:active`;

    await pubSubRedis.hset(
      `medplum:subscriptions:r4:project:${projectId1}:active:Observation`,
      `Subscription/${sub1Id}`,
      'Observation?status=final'
    );
    await pubSubRedis.hset(
      `medplum:subscriptions:r4:project:${projectId2}:active:Observation`,
      `Subscription/${sub2Id}`,
      'Observation?status=final'
    );
    // Cache entry for sub1 includes meta.author so the project-scoped clear can find the user key
    await cacheRedis.set(
      `Subscription/${sub1Id}`,
      JSON.stringify({
        resource: { resourceType: 'Subscription', id: sub1Id, meta: { author: { reference: authorRef } } },
        projectId: projectId1,
      })
    );
    await cacheRedis.set(`Subscription/${sub2Id}`, JSON.stringify({ id: sub2Id }));
    // User has both subs active; only sub1 should be removed when clearing project1
    await pubSubRedis.sadd(userKey, `Subscription/${sub1Id}`, `Subscription/${sub2Id}`);

    try {
      const accessToken = await initTestAuth({ project: { superAdmin: true } });

      const res = await request(app)
        .post('/fhir/R4/$clear-all-ws-subs')
        .set('Authorization', 'Bearer ' + accessToken)
        .type('json')
        .send({
          resourceType: 'Parameters',
          parameter: [{ name: 'projectId', valueString: projectId1 }],
        });

      expect(res.status).toBe(200);

      expect(await pubSubRedis.exists(`medplum:subscriptions:r4:project:${projectId1}:active:Observation`)).toBe(0);
      expect(await cacheRedis.exists(`Subscription/${sub1Id}`)).toBe(0);
      expect(await pubSubRedis.exists(`medplum:subscriptions:r4:project:${projectId2}:active:Observation`)).toBe(1);
      expect(await cacheRedis.exists(`Subscription/${sub2Id}`)).toBe(1);
      // sub1 SREMed from user set; sub2 from project2 remains
      expect(await pubSubRedis.smembers(userKey)).toEqual([`Subscription/${sub2Id}`]);
    } finally {
      await pubSubRedis.del(`medplum:subscriptions:r4:project:${projectId2}:active:Observation`);
      await pubSubRedis.del(userKey);
      await cacheRedis.del(`Subscription/${sub2Id}`);
    }
  });
});
