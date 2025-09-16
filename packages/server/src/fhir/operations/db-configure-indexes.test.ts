// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
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

  const tableName = 'Gin_Index_Configure_Test_Table';
  const escapedTableName = escapeIdentifier(tableName);

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ project: { superAdmin: true } });

    // Create a test table
    const client = getDatabasePool(DatabaseMode.WRITER);
    await client.query(`DROP TABLE IF EXISTS ${escapedTableName}`);
    await client.query(`CREATE TABLE ${escapedTableName} (aaa UUID[], bbb TEXT[])`);
    await client.query(
      `CREATE INDEX CONCURRENTLY "${tableName}_aaa_idx" ON ${escapedTableName} USING gin (aaa) WITH (fastupdate = ye, gin_pending_list_limit = 1024)`
    );
    await client.query(`CREATE INDEX CONCURRENTLY "${tableName}_bbb_idx" ON ${escapedTableName} USING gin (bbb)`);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('tableName is required', async () => {
    const res = await request(app)
      .post('/fhir/R4/$db-configure-indexes')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'fastUpdate',
            valueBoolean: true,
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: { text: 'tableName must be specified' },
        },
      ],
    });
  });

  test('fastUpdate or ginPendingListLimit is required', async () => {
    const res = await request(app)
      .post('/fhir/R4/$db-configure-indexes')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tableName',
            valueString: tableName,
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: { text: 'fastUpdate or ginPendingListLimit must be specified' },
        },
      ],
    });
  });

  test('Success with tableName and fastupdate=on and ginPendingListLimit', async () => {
    const res = await request(app)
      .post('/fhir/R4/$db-configure-indexes')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tableName',
            valueString: tableName,
          },
          {
            name: 'fastUpdate',
            valueBoolean: true,
          },
          {
            name: 'ginPendingListLimit',
            valueInteger: 128,
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.parameter).toHaveLength(2);
    expect(res.body).toStrictEqual({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'result',
          part: [
            {
              name: 'tableName',
              valueString: 'Gin_Index_Configure_Test_Table',
            },
            {
              name: 'indexName',
              valueString: 'Gin_Index_Configure_Test_Table_aaa_idx',
            },
          ],
        },
        {
          name: 'result',
          part: [
            {
              name: 'tableName',
              valueString: 'Gin_Index_Configure_Test_Table',
            },
            {
              name: 'indexName',
              valueString: 'Gin_Index_Configure_Test_Table_bbb_idx',
            },
          ],
        },
      ],
    });
  });

  test('Success with tableName and fastupdate=off', async () => {
    const res = await request(app)
      .post('/fhir/R4/$db-configure-indexes')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tableName',
            valueString: tableName,
          },
          {
            name: 'fastUpdate',
            valueBoolean: false,
          },
          {
            name: 'ginPendingListLimit',
            valueInteger: 128,
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.parameter).toHaveLength(2);
    expect(res.body).toStrictEqual({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'result',
          part: [
            {
              name: 'tableName',
              valueString: 'Gin_Index_Configure_Test_Table',
            },
            {
              name: 'indexName',
              valueString: 'Gin_Index_Configure_Test_Table_aaa_idx',
            },
            {
              name: 'pagesCleaned',
              valueString: '0',
            },
          ],
        },
        {
          name: 'result',
          part: [
            {
              name: 'tableName',
              valueString: 'Gin_Index_Configure_Test_Table',
            },
            {
              name: 'indexName',
              valueString: 'Gin_Index_Configure_Test_Table_bbb_idx',
            },
            {
              name: 'pagesCleaned',
              valueString: '0',
            },
          ],
        },
      ],
    });
  });

  test('Invalid tableName', async () => {
    const res = await request(app)
      .post('/fhir/R4/$db-configure-indexes')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tableName',
            valueString: 'Robert"; DROP TABLE Students;',
          },
          {
            name: 'fastUpdate',
            valueBoolean: true,
          },
        ],
      });
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
