// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Parameters } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { ActiveSubscriptionEntry } from '../../pubsub';
import { getActiveSubsKey } from '../../pubsub';
import { getPubSubRedis } from '../../redis';
import { initTestAuth } from '../../test.setup';
import type { WsSubProjectDetailStats } from './getwssubprojectstats';

describe('$get-ws-sub-project-stats', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Access denied', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: false } });

    const res = await request(app)
      .get('/fhir/R4/$get-ws-sub-project-stats')
      .query({ projectId: randomUUID() })
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(403);
  });

  test('Returns 400 when projectId is missing', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res = await request(app)
      .get('/fhir/R4/$get-ws-sub-project-stats')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Returns empty resource types for unknown project', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res = await request(app)
      .get('/fhir/R4/$get-ws-sub-project-stats')
      .query({ projectId: randomUUID() })
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const params = res.body as Parameters;
    const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
    expect(statsStr).toBeDefined();
    const stats = JSON.parse(statsStr as string) as WsSubProjectDetailStats;
    expect(Array.isArray(stats.resourceTypes)).toBe(true);
    expect(stats.resourceTypes).toHaveLength(0);
  });

  test('Returns resource types with criteria and full entries for a project', async () => {
    const redis = getPubSubRedis();
    const projectId = randomUUID();

    const entry1: ActiveSubscriptionEntry = {
      criteria: 'Observation?code=85354-9',
      expiration: 1700000000,
      author: 'Practitioner/author1',
      loginId: 'login1',
      membershipId: 'membership1',
    };
    const entry2: ActiveSubscriptionEntry = {
      criteria: 'Observation?code=85354-9',
      expiration: 1700001000,
      author: 'Practitioner/author2',
      loginId: 'login2',
      membershipId: 'membership2',
    };
    const entry3: ActiveSubscriptionEntry = {
      criteria: 'Observation?status=final',
      expiration: 1700002000,
      author: 'Practitioner/author3',
      loginId: 'login3',
      membershipId: 'membership3',
    };
    const entry4: ActiveSubscriptionEntry = {
      criteria: 'Patient?name=Alice',
      expiration: 1700003000,
      author: 'Practitioner/author4',
      loginId: 'login4',
      membershipId: 'membership4',
    };

    await redis.hset(
      getActiveSubsKey(projectId, 'Observation'),
      'Subscription/sub1',
      JSON.stringify(entry1),
      'Subscription/sub2',
      JSON.stringify(entry2),
      'Subscription/sub3',
      JSON.stringify(entry3)
    );
    await redis.hset(getActiveSubsKey(projectId, 'Patient'), 'Subscription/sub4', JSON.stringify(entry4));

    try {
      const accessToken = await initTestAuth({ project: { superAdmin: true } });

      const res = await request(app)
        .get('/fhir/R4/$get-ws-sub-project-stats')
        .query({ projectId })
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res.status).toBe(200);

      const params = res.body as Parameters;
      const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
      expect(statsStr).toBeDefined();
      const stats = JSON.parse(statsStr as string) as WsSubProjectDetailStats;

      expect(stats.projectId).toBe(projectId);
      // Resource types sorted descending by count
      expect(stats.resourceTypes[0].resourceType).toBe('Observation');

      const obType = stats.resourceTypes.find((rt) => rt.resourceType === 'Observation');
      expect(obType).toBeDefined();
      expect(obType?.count).toBe(3);
      expect(obType?.criteria).toHaveLength(2);
      // Criteria sorted descending by count
      expect(obType?.criteria[0].criteria).toBe('Observation?code=85354-9');
      expect(obType?.criteria[0].count).toBe(2);
      expect(obType?.criteria[0].entries).toHaveLength(2);
      expect(obType?.criteria[0].entries).toEqual(
        expect.arrayContaining([
          { subscriptionId: 'sub1', criteria: entry1.criteria, expiration: entry1.expiration, author: entry1.author },
          { subscriptionId: 'sub2', criteria: entry2.criteria, expiration: entry2.expiration, author: entry2.author },
        ])
      );

      expect(obType?.criteria[1].criteria).toBe('Observation?status=final');
      expect(obType?.criteria[1].count).toBe(1);
      expect(obType?.criteria[1].entries).toEqual([
        { subscriptionId: 'sub3', criteria: entry3.criteria, expiration: entry3.expiration, author: entry3.author },
      ]);

      const patientType = stats.resourceTypes.find((rt) => rt.resourceType === 'Patient');
      expect(patientType).toBeDefined();
      expect(patientType?.count).toBe(1);
      expect(patientType?.criteria[0].criteria).toBe('Patient?name=Alice');
      expect(patientType?.criteria[0].count).toBe(1);
      expect(patientType?.criteria[0].entries).toEqual([
        { subscriptionId: 'sub4', criteria: entry4.criteria, expiration: entry4.expiration, author: entry4.author },
      ]);
    } finally {
      await redis.del(getActiveSubsKey(projectId, 'Observation'), getActiveSubsKey(projectId, 'Patient'));
    }
  });

  test('Ignores legacy keys without v2 segment in project stats', async () => {
    const redis = getPubSubRedis();
    const projectId = randomUUID();

    const entry: ActiveSubscriptionEntry = {
      criteria: 'Observation?code=85354-9',
      expiration: 1700000000,
      author: 'Practitioner/author1',
      loginId: 'login1',
      membershipId: 'membership1',
    };
    await redis.hset(
      getActiveSubsKey(projectId, 'Observation'),
      'Subscription/sub1',
      JSON.stringify(entry)
    );
    // Legacy key formats that should not appear in stats
    await redis.hset(
      `medplum:subscriptions:r4:project:${projectId}:active:Observation`,
      'Subscription/sub2',
      'Observation'
    );
    await redis.hset(`medplum:subscriptions:r4:project:${projectId}:active:v2`, 'Subscription/sub3', 'Observation');

    try {
      const accessToken = await initTestAuth({ project: { superAdmin: true } });

      const res = await request(app)
        .get('/fhir/R4/$get-ws-sub-project-stats')
        .query({ projectId })
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res.status).toBe(200);

      const params = res.body as Parameters;
      const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
      const stats = JSON.parse(statsStr as string) as WsSubProjectDetailStats;

      // Only the v2-format key should be counted
      const obType = stats.resourceTypes.find((rt) => rt.resourceType === 'Observation');
      expect(obType?.count).toBe(1);
    } finally {
      await redis.del(
        getActiveSubsKey(projectId, 'Observation'),
        `medplum:subscriptions:r4:project:${projectId}:active:Observation`,
        `medplum:subscriptions:r4:project:${projectId}:active:v2`
      );
    }
  });
});
