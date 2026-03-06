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
import type { WsSubStats } from './getwssubstats';
import { parseActiveSubKey } from './getwssubstats';

describe('$get-ws-sub-stats', () => {
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
      .get('/fhir/R4/$get-ws-sub-stats')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(403);
  });

  test('Returns empty stats when no subscriptions exist for test key prefix', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res = await request(app)
      .get('/fhir/R4/$get-ws-sub-stats')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const params = res.body as Parameters;
    const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
    expect(statsStr).toBeDefined();
    const stats = JSON.parse(statsStr as string) as WsSubStats;
    expect(Array.isArray(stats.projects)).toBe(true);
  });

  test('Returns stats with subscriptions (no criteria)', async () => {
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
        .get('/fhir/R4/$get-ws-sub-stats')
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res.status).toBe(200);

      const params = res.body as Parameters;
      const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
      expect(statsStr).toBeDefined();
      const stats = JSON.parse(statsStr as string) as WsSubStats;

      const project = stats.projects.find((p) => p.projectId === projectId);
      expect(project).toBeDefined();
      expect(project?.subscriptionCount).toBe(4);
      // Resource types sorted descending by count
      expect(project?.resourceTypes[0].resourceType).toBe('Observation');

      const obType = project?.resourceTypes.find((rt) => rt.resourceType === 'Observation');
      expect(obType).toBeDefined();
      expect(obType?.count).toBe(3);
      // Criteria not included in summary response
      expect(obType).not.toHaveProperty('criteria');

      const patientType = project?.resourceTypes.find((rt) => rt.resourceType === 'Patient');
      expect(patientType).toBeDefined();
      expect(patientType?.count).toBe(1);
    } finally {
      await redis.del(
        `medplum:subscriptions:r4:project:${projectId}:active:Observation`,
        `medplum:subscriptions:r4:project:${projectId}:active:Patient`
      );
    }
  });

  test('parseActiveSubKey', () => {
    const projectId = randomUUID();

    expect(parseActiveSubKey(`medplum:subscriptions:r4:project:${projectId}:active:Observation`)).toEqual({
      projectId,
      resourceType: 'Observation',
    });

    expect(parseActiveSubKey(`medplum:subscriptions:r4:project:${projectId}:active:DocumentReference`)).toEqual({
      projectId,
      resourceType: 'DocumentReference',
    });

    expect(parseActiveSubKey('invalid:key')).toBeUndefined();
    expect(parseActiveSubKey('medplum:subscriptions:r4:project:no-active-part')).toBeUndefined();
    // Legacy pre-release key format — must be filtered out
    expect(parseActiveSubKey(`medplum:subscriptions:r4:project:${projectId}:active:v2`)).toBeUndefined();
  });

  test('Ignores legacy v2 keys in stats', async () => {
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
        .get('/fhir/R4/$get-ws-sub-stats')
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res.status).toBe(200);

      const params = res.body as Parameters;
      const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
      const stats = JSON.parse(statsStr as string) as WsSubStats;

      const project = stats.projects.find((p) => p.projectId === projectId);
      expect(project).toBeDefined();
      expect(project?.subscriptionCount).toBe(1);
      expect(project?.resourceTypes.every((rt) => rt.resourceType !== 'v2')).toBe(true);
    } finally {
      await redis.del(
        `medplum:subscriptions:r4:project:${projectId}:active:Observation`,
        `medplum:subscriptions:r4:project:${projectId}:active:v2`
      );
    }
  });
});
