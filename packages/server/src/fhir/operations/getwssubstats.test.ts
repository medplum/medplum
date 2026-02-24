// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getRedis } from '../../redis';
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
      .post('/fhir/R4/$get-ws-sub-stats')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(403);
  });

  test('Returns empty stats when no subscriptions exist for test key prefix', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res = await request(app)
      .post('/fhir/R4/$get-ws-sub-stats')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(200);

    const params = res.body as Parameters;
    const statsStr = params.parameter?.find((p) => p.name === 'stats')?.valueString;
    expect(statsStr).toBeDefined();
    const stats = JSON.parse(statsStr as string) as WsSubStats;
    expect(Array.isArray(stats.projects)).toBe(true);
  });

  test('Returns stats with subscriptions', async () => {
    const redis = getRedis();
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
        .post('/fhir/R4/$get-ws-sub-stats')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({});
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
      expect(obType?.criteria).toHaveLength(2);
      // Criteria sorted descending by count
      expect(obType?.criteria[0]).toEqual({ criteria: 'Observation?code=85354-9', count: 2 });
      expect(obType?.criteria[1]).toEqual({ criteria: 'Observation?status=final', count: 1 });

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
  });
});
