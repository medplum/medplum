// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Parameters } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getPubSubRedis } from '../../redis';
import { initTestAuth } from '../../test.setup';
import type { WsSubProjectDetailStats } from './getwssubstats';

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

  test('Returns resource types with criteria for a project', async () => {
    const redis = getPubSubRedis();
    const projectId = randomUUID();

    await redis.hset(
      `medplum:subscriptions:r4:project:${projectId}:active:Observation`,
      'Subscription/sub1',
      'Observation?code=85354-9',
      'Subscription/sub2',
      'Observation?code=85354-9',
      'Subscription/sub3',
      'Observation?status=final'
    );
    await redis.hset(
      `medplum:subscriptions:r4:project:${projectId}:active:Patient`,
      'Subscription/sub4',
      'Patient?name=Alice'
    );

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
      expect(obType?.criteria[0]).toEqual({ criteria: 'Observation?code=85354-9', count: 2 });
      expect(obType?.criteria[1]).toEqual({ criteria: 'Observation?status=final', count: 1 });

      const patientType = stats.resourceTypes.find((rt) => rt.resourceType === 'Patient');
      expect(patientType).toBeDefined();
      expect(patientType?.count).toBe(1);
      expect(patientType?.criteria).toEqual([{ criteria: 'Patient?name=Alice', count: 1 }]);
    } finally {
      await redis.del(
        `medplum:subscriptions:r4:project:${projectId}:active:Observation`,
        `medplum:subscriptions:r4:project:${projectId}:active:Patient`
      );
    }
  });

  test('Ignores legacy v2 keys in project stats', async () => {
    const redis = getPubSubRedis();
    const projectId = randomUUID();

    await redis.hset(
      `medplum:subscriptions:r4:project:${projectId}:active:Observation`,
      'Subscription/sub1',
      'Observation?code=85354-9'
    );
    // Legacy key that should not appear in stats
    await redis.hset(`medplum:subscriptions:r4:project:${projectId}:active:v2`, 'Subscription/sub2', 'Observation');

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

      expect(stats.resourceTypes.every((rt) => rt.resourceType !== 'v2')).toBe(true);
      const obType = stats.resourceTypes.find((rt) => rt.resourceType === 'Observation');
      expect(obType?.count).toBe(1);
    } finally {
      await redis.del(
        `medplum:subscriptions:r4:project:${projectId}:active:Observation`,
        `medplum:subscriptions:r4:project:${projectId}:active:v2`
      );
    }
  });
});
