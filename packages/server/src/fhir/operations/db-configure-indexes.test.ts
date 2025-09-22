// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import express from 'express';
import { escapeIdentifier } from 'pg';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { initTestAuth, waitForAsyncJob } from '../../test.setup';

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

  test('Must prefer async', async () => {
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
          details: { text: 'Operation requires "Prefer: respond-async"' },
        },
      ],
    });
  });

  test('tableName is required', async () => {
    const res = await request(app)
      .post('/fhir/R4/$db-configure-indexes')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Prefer', 'respond-async')
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
      .set('Prefer', 'respond-async')
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
          details: { text: 'At least one of fastUpdateAction or ginPendingListLimitAction must be specified' },
        },
      ],
    });
  });

  test('Success with tableName and fastupdate=on and ginPendingListLimit', async () => {
    const res = await request(app)
      .post('/fhir/R4/$db-configure-indexes')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Prefer', 'respond-async')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tableName',
            valueString: tableName,
          },
          {
            name: 'fastUpdateAction',
            valueString: 'set',
          },
          {
            name: 'fastUpdateValue',
            valueBoolean: true,
          },
          {
            name: 'ginPendingListLimitAction',
            valueString: 'set',
          },
          {
            name: 'ginPendingListLimitValue',
            valueInteger: 128,
          },
        ],
      });
    expect(res.status).toBe(202);

    const asyncJob = await waitForAsyncJob(res.headers['content-location'], app, accessToken);

    expect(asyncJob.output).toStrictEqual({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'action',
          part: [
            {
              name: 'sql',
              valueString:
                'ALTER INDEX public."Gin_Index_Configure_Test_Table_aaa_idx" SET (fastupdate = true, gin_pending_list_limit = 128)',
            },
          ],
        },
        {
          name: 'action',
          part: [
            {
              name: 'sql',
              valueString:
                'ALTER INDEX public."Gin_Index_Configure_Test_Table_bbb_idx" SET (fastupdate = true, gin_pending_list_limit = 128)',
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
      .set('Prefer', 'respond-async')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'tableName',
            valueString: tableName,
          },
          {
            name: 'fastUpdateAction',
            valueString: 'set',
          },
          {
            name: 'fastUpdateValue',
            valueBoolean: false,
          },
          {
            name: 'ginPendingListLimitAction',
            valueString: 'reset',
          },
        ],
      });
    expect(res.status).toBe(202);

    const asyncJob = await waitForAsyncJob(res.headers['content-location'], app, accessToken);

    expect(asyncJob.output).toStrictEqual({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'action',
          part: [
            {
              name: 'sql',
              valueString: 'ALTER INDEX public."Gin_Index_Configure_Test_Table_aaa_idx" RESET (gin_pending_list_limit)',
            },
          ],
        },
        {
          name: 'action',
          part: [
            {
              name: 'sql',
              valueString: 'ALTER INDEX public."Gin_Index_Configure_Test_Table_aaa_idx" SET (fastupdate = false)',
            },
          ],
        },
        {
          name: 'action',
          part: [
            {
              name: 'sql',
              valueString: 'ALTER INDEX public."Gin_Index_Configure_Test_Table_bbb_idx" RESET (gin_pending_list_limit)',
            },
          ],
        },
        {
          name: 'action',
          part: [
            {
              name: 'sql',
              valueString: 'ALTER INDEX public."Gin_Index_Configure_Test_Table_bbb_idx" SET (fastupdate = false)',
            },
          ],
        },
        {
          name: 'action',
          part: [
            {
              name: 'sql',
              valueString: 'VACUUM "Gin_Index_Configure_Test_Table"',
            },
            {
              name: 'durationMs',
              valueInteger: expect.any(Number),
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
      .set('Prefer', 'respond-async')
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
