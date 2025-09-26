// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import { escapeIdentifier } from 'pg';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { initTestAuth } from '../../test.setup';

describe('dbgetginindexes', () => {
  const app = express();

  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ project: { superAdmin: true } });

    // Create a test table
    const client = getDatabasePool(DatabaseMode.WRITER);
    await client.query(`DROP TABLE IF EXISTS ${escapedTableName}`);
    await client.query(`CREATE TABLE ${escapedTableName} (aaa UUID[], bbb TEXT[])`);
    await client.query(
      `CREATE INDEX CONCURRENTLY "Gin_Index_Test_Table_aaa_idx" ON ${escapedTableName} USING gin (aaa) WITH (fastupdate = ye, gin_pending_list_limit = 1024)`
    );
    await client.query(
      `CREATE INDEX CONCURRENTLY "Gin_Index_Test_Table_bbb_idx" ON ${escapedTableName} USING gin (bbb)`
    );
  });

  const tableName = 'Gin_Index_Test_Table';
  const escapedTableName = escapeIdentifier(tableName);

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success without tableName', async () => {
    const res = await request(app)
      .get('/fhir/R4/$db-indexes?tableName=')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'defaultGinPendingListLimit',
          valueInteger: expect.any(Number),
        },
      ],
    });
  });

  test('Success with tableName', async () => {
    const res = await request(app)
      .get(`/fhir/R4/$db-indexes?tableName=${tableName}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resourceType: 'Parameters',
      parameter: expect.arrayContaining([
        {
          name: 'defaultGinPendingListLimit',
          valueInteger: expect.any(Number),
        },
      ]),
    });

    const indexes = (res.body.parameter as ParametersParameter[]).filter((p) => p.name === 'index');
    expect(indexes).toHaveLength(2);

    expect(indexes[0].name).toBe('index');
    expect(indexes[0].part?.find((p) => p.name === 'tableName')?.valueString).toBe('Gin_Index_Test_Table');
    expect(indexes[0].part?.find((p) => p.name === 'indexName')?.valueString).toBe('Gin_Index_Test_Table_aaa_idx');
    expect(indexes[0].part?.find((p) => p.name === 'fastUpdate')?.valueBoolean).toBe(true);
    expect(indexes[0].part?.find((p) => p.name === 'indexOptions')?.valueString).toBe(
      '{fastupdate=ye,gin_pending_list_limit=1024}'
    );
    expect(indexes[0].part?.find((p) => p.name === 'ginPendingListLimit')?.valueInteger).toBe(1024);

    expect(indexes[1].name).toBe('index');
    expect(indexes[1].part?.find((p) => p.name === 'tableName')?.valueString).toBe('Gin_Index_Test_Table');
    expect(indexes[1].part?.find((p) => p.name === 'indexName')?.valueString).toBe('Gin_Index_Test_Table_bbb_idx');
    expect(indexes[1].part?.find((p) => p.name === 'fastUpdate')?.valueBoolean).toBeUndefined();
    expect(indexes[1].part?.find((p) => p.name === 'indexOptions')).toBeUndefined();
    expect(indexes[1].part?.find((p) => p.name === 'ginPendingListLimit')?.valueInteger).toBeUndefined();
  });

  test('Invalid tableName', async () => {
    const res = await request(app)
      .get(`/fhir/R4/$db-indexes?tableName=${encodeURIComponent('Robert"; DROP TABLE Students;')}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: { text: 'Invalid tableName' },
        },
      ],
    });
  });
});
