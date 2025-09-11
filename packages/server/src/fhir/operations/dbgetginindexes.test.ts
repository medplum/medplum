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
    await client.query(`CREATE TABLE ${escapedTableName} (name UUID[])`);
    await client.query(
      `CREATE INDEX CONCURRENTLY "Gin_Index_Test_Table_name_idx" ON ${escapedTableName} USING gin (name) WITH (gin_pending_list_limit = 1024)`
    );
  });

  const tableName = 'Gin_Index_Test_Table';
  const escapedTableName = escapeIdentifier(tableName);

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success without tableName', async () => {
    const res = await request(app)
      .get('/fhir/R4/$db-gin-indexes?tableName=')
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
      .get(`/fhir/R4/$db-gin-indexes?tableName=${tableName}`)
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
    expect(indexes).toHaveLength(1);
    expectIndex(indexes[0]);
  });

  test('Invalid tableName', async () => {
    const res = await request(app)
      .get(`/fhir/R4/$db-gin-indexes?tableName=${encodeURIComponent('Robert"; DROP TABLE Students;')}`)
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

function expectIndex(indexParam: ParametersParameter | undefined): void {
  expect(indexParam).toMatchObject({
    name: 'index',
    part: expect.arrayContaining([
      expect.objectContaining({
        name: 'tableName',
        valueString: 'Gin_Index_Test_Table',
      }),
      expect.objectContaining({
        name: 'indexName',
        valueString: 'Gin_Index_Test_Table_name_idx',
      }),
      expect.objectContaining({
        name: 'indexOptions',
        valueString: '{gin_pending_list_limit=1024}',
      }),
      expect.objectContaining({
        name: 'fastUpdate',
        valueBoolean: true,
      }),
      expect.objectContaining({
        name: 'ginPendingListLimit',
        valueInteger: 1024,
      }),
    ]),
  });
}
