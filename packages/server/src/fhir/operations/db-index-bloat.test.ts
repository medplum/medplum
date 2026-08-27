// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Parameters } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { initTestAuth } from '../../test.setup';
import type { BtreeIndexStatsRow, GinIndexStatsRow } from './db-index-bloat';
import { calculateBtreeBloat, calculateGinBloat } from './db-index-bloat';

describe('$db-index-bloat', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const client = getDatabasePool(DatabaseMode.WRITER);
    await client.query('CREATE EXTENSION IF NOT EXISTS pgstattuple');
    await client.query('CREATE EXTENSION IF NOT EXISTS pageinspect');
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Returns B-tree and GIN estimates', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });
    const res = await request(app)
      .get('/fhir/R4/$db-index-bloat?minBloatPercent=0&minBloatBytes=0')
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res).toHaveStatus(200);
    const params = res.body as Parameters;
    const indexes = params.parameter?.filter((parameter) => parameter.name === 'index') ?? [];
    expect(
      indexes.some((index) => index.part?.some((part) => part.name === 'indexType' && part.valueCode === 'btree'))
    ).toBe(true);
    expect(
      indexes.some((index) => index.part?.some((part) => part.name === 'indexType' && part.valueCode === 'gin'))
    ).toBe(true);
  });

  test('Rejects invalid thresholds', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });
    const res = await request(app)
      .get('/fhir/R4/$db-index-bloat?minBloatPercent=101&minBloatBytes=-1')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(400);
  });

  test('Access denied', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: false } });
    const res = await request(app)
      .get('/fhir/R4/$db-index-bloat')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(403);
  });
});

describe('Index bloat calculations', () => {
  const base = {
    schemaName: 'public',
    tableName: 'Observation',
    indexName: 'Observation_test_idx',
    indexSize: '1000',
    blockSize: '100',
  };

  test('Calculates B-tree bloat from density and unused pages', () => {
    const result = calculateBtreeBloat({
      ...base,
      fillFactor: 90,
      leafPages: '8',
      emptyPages: '1',
      deletedPages: '1',
      avgLeafDensity: 45,
      leafFragmentation: 12.5,
    } satisfies BtreeIndexStatsRow);

    expect(result).toMatchObject({
      indexType: 'btree',
      estimatedBloatSize: 600,
      bloatPercent: 60,
      fillFactor: 90,
      avgLeafDensity: 45,
    });
  });

  test('Calculates GIN bloat from unaccounted pages', () => {
    const result = calculateGinBloat({
      ...base,
      totalPages: '10',
      entryPages: '3',
      dataPages: '2',
      pendingPages: '1',
    } satisfies GinIndexStatsRow);

    expect(result).toMatchObject({
      indexType: 'gin',
      estimatedBloatSize: 300,
      bloatPercent: 30,
      pendingPages: 1,
    });
  });

  test('Clamps stale GIN metadata to zero bloat', () => {
    const result = calculateGinBloat({
      ...base,
      totalPages: '2',
      entryPages: '3',
      dataPages: '2',
      pendingPages: '1',
    } satisfies GinIndexStatsRow);

    expect(result.estimatedBloatSize).toBe(0);
    expect(result.bloatPercent).toBe(0);
  });
});
