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
import { calculateBtreeBloat, calculateGinDensity } from './db-index-bloat';

describe('$db-index-bloat', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const client = getDatabasePool(DatabaseMode.WRITER);
    await client.query('CREATE EXTENSION IF NOT EXISTS pgstattuple');
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Returns B-tree bloat and GIN density', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });
    const res = await request(app)
      .get('/fhir/R4/$db-index-bloat?minBloatPercent=0&minIndexSize=0')
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

  test('Filters by table name', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });
    const res = await request(app)
      .get('/fhir/R4/$db-index-bloat?tableName=Patient&minBloatPercent=0&minIndexSize=0')
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res).toHaveStatus(200);
    const params = res.body as Parameters;
    const indexes = params.parameter?.filter((parameter) => parameter.name === 'index') ?? [];
    expect(indexes.length).toBeGreaterThan(0);
    expect(
      indexes.every((index) => index.part?.find((part) => part.name === 'tableName')?.valueString === 'Patient')
    ).toBe(true);
  });

  test('Rejects invalid table names', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });
    const res = await request(app)
      .get(`/fhir/R4/$db-index-bloat?tableName=${encodeURIComponent('Patient; DROP TABLE Patient')}`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res).toHaveStatus(400);
  });

  test('Rejects invalid thresholds', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });
    const res = await request(app)
      .get('/fhir/R4/$db-index-bloat?minBloatPercent=101&minIndexSize=-1')
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

  test('Calculates GIN live tuple density', () => {
    const result = calculateGinDensity({
      schemaName: base.schemaName,
      tableName: base.tableName,
      indexName: base.indexName,
      indexSize: base.indexSize,
      liveTuples: '900',
      allocatedPages: '300',
    } satisfies GinIndexStatsRow);

    expect(result).toMatchObject({
      indexType: 'gin',
      liveTuples: 900,
      allocatedPages: 300,
      liveTuplesPerPage: 3,
    });
    expect(result.estimatedBloatSize).toBeUndefined();
    expect(result.bloatPercent).toBeUndefined();
  });

  test('Handles an empty GIN index', () => {
    const result = calculateGinDensity({
      schemaName: base.schemaName,
      tableName: base.tableName,
      indexName: base.indexName,
      indexSize: base.indexSize,
      liveTuples: '0',
      allocatedPages: '0',
    } satisfies GinIndexStatsRow);

    expect(result.liveTuplesPerPage).toBe(0);
  });
});
