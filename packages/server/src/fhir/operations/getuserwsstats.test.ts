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
import type { WsUserSubStats } from './getuserwsstats';

describe('$get-user-ws-stats', () => {
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
      .post('/fhir/R4/$get-user-ws-stats')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'userRef', valueReference: { reference: 'Practitioner/test' } }] });
    expect(res.status).toBe(403);
  });

  test('Returns empty stats when user has no active subscriptions', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });
    const userRef = `Practitioner/${randomUUID()}`;

    const res = await request(app)
      .post('/fhir/R4/$get-user-ws-stats')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'userRef', valueReference: { reference: userRef } }] });
    expect(res.status).toBe(200);

    const params = res.body as Parameters;
    const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
    expect(statsStr).toBeDefined();
    const stats = JSON.parse(statsStr as string) as WsUserSubStats;
    expect(stats.userRef).toBe(userRef);
    expect(stats.totalCount).toBe(0);
    expect(stats.criteriaGroups).toHaveLength(0);
  });

  test('Groups active subscriptions by criteria', async () => {
    const pubSubRedis = getPubSubRedis();
    const cacheRedis = getCacheRedis();
    const userRef = `Practitioner/${randomUUID()}`;
    const userKey = `medplum:subscriptions:r4:user:${userRef}:active`;

    const sub1Id = randomUUID();
    const sub2Id = randomUUID();
    const sub3Id = randomUUID();
    const sub1Ref = `Subscription/${sub1Id}`;
    const sub2Ref = `Subscription/${sub2Id}`;
    const sub3Ref = `Subscription/${sub3Id}`;

    // Seed user active set
    await pubSubRedis.sadd(userKey, sub1Ref, sub2Ref, sub3Ref);

    // Seed cache entries (two share a criteria, one different)
    const makeCacheEntry = (id: string, criteria: string): string =>
      JSON.stringify({
        resourceType: 'Subscription',
        resource: {
          resourceType: 'Subscription',
          id,
          criteria,
          channel: { type: 'websocket' },
          status: 'active',
        },
        projectId: randomUUID(),
        lastUpdated: new Date().toISOString(),
      });

    await cacheRedis.set(sub1Ref, makeCacheEntry(sub1Id, 'Observation?subject=Patient/123'));
    await cacheRedis.set(sub2Ref, makeCacheEntry(sub2Id, 'Observation?subject=Patient/123'));
    await cacheRedis.set(sub3Ref, makeCacheEntry(sub3Id, 'Patient?name=Alice'));

    try {
      const accessToken = await initTestAuth({ project: { superAdmin: true } });

      const res = await request(app)
        .post('/fhir/R4/$get-user-ws-stats')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Parameters', parameter: [{ name: 'userRef', valueReference: { reference: userRef } }] });
      expect(res.status).toBe(200);

      const params = res.body as Parameters;
      const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
      const stats = JSON.parse(statsStr as string) as WsUserSubStats;

      expect(stats.userRef).toBe(userRef);
      expect(stats.totalCount).toBe(3);
      expect(stats.criteriaGroups).toHaveLength(2);

      // Sorted descending by count
      const obs = stats.criteriaGroups.find((g) => g.criteria === 'Observation?subject=Patient/123');
      expect(obs).toBeDefined();
      expect(obs?.count).toBe(2);
      expect(obs?.refs).toHaveLength(2);

      const pat = stats.criteriaGroups.find((g) => g.criteria === 'Patient?name=Alice');
      expect(pat).toBeDefined();
      expect(pat?.count).toBe(1);

      // No stale entries
      expect(stats.criteriaGroups.find((g) => g.criteria === 'Stale')).toBeUndefined();
    } finally {
      await pubSubRedis.del(userKey);
      await cacheRedis.del(sub1Ref, sub2Ref, sub3Ref);
    }
  });

  test('Groups missing cache entries as Stale', async () => {
    const pubSubRedis = getPubSubRedis();
    const cacheRedis = getCacheRedis();
    const userRef = `Practitioner/${randomUUID()}`;
    const userKey = `medplum:subscriptions:r4:user:${userRef}:active`;

    const subLiveId = randomUUID();
    const subStaleId = randomUUID();
    const subLiveRef = `Subscription/${subLiveId}`;
    const subStaleRef = `Subscription/${subStaleId}`;

    await pubSubRedis.sadd(userKey, subLiveRef, subStaleRef);

    // Only seed the live entry in cache
    await cacheRedis.set(
      subLiveRef,
      JSON.stringify({
        resourceType: 'Subscription',
        resource: {
          resourceType: 'Subscription',
          id: subLiveId,
          criteria: 'Observation',
          channel: { type: 'websocket' },
          status: 'active',
        },
        projectId: randomUUID(),
        lastUpdated: new Date().toISOString(),
      })
    );

    try {
      const accessToken = await initTestAuth({ project: { superAdmin: true } });

      const res = await request(app)
        .post('/fhir/R4/$get-user-ws-stats')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Parameters', parameter: [{ name: 'userRef', valueReference: { reference: userRef } }] });
      expect(res.status).toBe(200);

      const params = res.body as Parameters;
      const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
      const stats = JSON.parse(statsStr as string) as WsUserSubStats;

      expect(stats.totalCount).toBe(2);

      const stale = stats.criteriaGroups.find((g) => g.criteria === 'Stale');
      expect(stale).toBeDefined();
      expect(stale?.refs.map((r) => r.ref)).toContain(subStaleRef);

      const live = stats.criteriaGroups.find((g) => g.criteria === 'Observation');
      expect(live).toBeDefined();
      expect(live?.refs.map((r) => r.ref)).toContain(subLiveRef);
    } finally {
      await pubSubRedis.del(userKey);
      await cacheRedis.del(subLiveRef);
    }
  });
});
