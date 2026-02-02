// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, EMPTY } from '@medplum/core';
import type { ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { escapeIdentifier } from 'pg';
import request from 'supertest';
import { NIL } from 'uuid';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { GLOBAL_SHARD_ID } from '../../sharding/sharding-utils';
import { initTestAuth } from '../../test.setup';

describe('getColumnStatisticsHandler', () => {
  const shardId = GLOBAL_SHARD_ID;
  const app = express();

  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ project: { superAdmin: true } });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('shardId required', async () => {
    const res = await request(app)
      .get('/fhir/R4/$db-column-statistics')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining("required input parameter 'shardId'") },
        },
      ],
    });
  });

  const pathWithShardId = `/fhir/R4/$db-column-statistics?shardId=${shardId}`;

  test('Success without tableName', async () => {
    const res = await request(app)
      .get(`${pathWithShardId}&tableName=`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'defaultStatisticsTarget',
          valueInteger: expect.any(Number),
        },
      ],
    });
  });

  test('Success with tableName', async () => {
    const res = await request(app)
      .get(`${pathWithShardId}&tableName=Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'defaultStatisticsTarget',
          valueInteger: expect.any(Number),
        },
        expect.objectContaining({
          name: 'table',
        }),
      ],
    });

    const columnPart = (res.body.parameter as ParametersParameter[]).find((p) => p.name === 'table');
    expectColumn(columnPart, 'id');
    expectColumn(columnPart, 'lastUpdated');
  });

  describe('well-known table', () => {
    let uuid1: string;
    let uuid2: string;
    const shardId = GLOBAL_SHARD_ID;

    const tableName = 'Column_Statistics_Test_Table';
    const escapedTableName = escapeIdentifier(tableName);

    beforeAll(async () => {
      uuid1 = randomUUID();
      uuid2 = randomUUID();

      const client = getDatabasePool(DatabaseMode.WRITER, shardId);
      await client.query(`DROP TABLE IF EXISTS ${escapedTableName}`);
      await client.query(`CREATE TABLE ${escapedTableName} (id bigint NOT NULL, aaa UUID[])`);
      await client.query(
        `INSERT INTO ${escapedTableName} (id, aaa) VALUES (1, '{${NIL},${uuid1}}'), (2, '{${NIL},${uuid2}}')`
      );
      await client.query(`ANALYZE ${escapedTableName}`);
    });

    test('Success with well-known tableName', async () => {
      const res = await request(app)
        .get(`${pathWithShardId}&tableName=${tableName}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'defaultStatisticsTarget',
            valueInteger: expect.any(Number),
          },
          expect.objectContaining({
            name: 'table',
          }),
        ],
      });

      const columnPart = (res.body.parameter as ParametersParameter[]).find((p) => p.name === 'table');
      expectColumn(columnPart, 'id', [
        { name: 'type', valueString: 'bigint' },
        { name: 'notNull', valueBoolean: true },
        { name: 'nDistinct', valueDecimal: -1 },
      ]);
      expectColumn(columnPart, 'aaa', [
        { name: 'type', valueString: 'uuid[]' },
        { name: 'notNull', valueBoolean: false },
        { name: 'mostCommonElemFreqs', valueString: '{1,0.5,0.5,0.5,1,0}' },
      ]);
    });
  });

  test('Invalid tableName', async () => {
    const res = await request(app)
      .get(`${pathWithShardId}&tableName=${encodeURIComponent('Robert"; DROP TABLE Students;')}`)
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

function expectColumn(tableParam: ParametersParameter | undefined, name: string, parts?: ParametersParameter[]): void {
  expect(tableParam).toMatchObject({
    name: 'table',
    part: expect.arrayContaining([
      expect.objectContaining({
        name: 'tableName',
        valueString: expect.any(String),
      }),
      expect.objectContaining({
        name: 'column',
        part: expect.arrayContaining([
          {
            name: 'name',
            valueString: name,
          },
          {
            name: 'statisticsTarget',
            valueInteger: -1,
          },
        ]),
      }),
    ]),
  });

  const column = tableParam?.part?.find(
    (p) => p.name === 'column' && p.part?.find((pp) => pp.name === 'name' && pp.valueString === name)
  ) as ParametersParameter;
  expect(column).toBeDefined();
  for (const part of parts ?? EMPTY) {
    const tablePart = column?.part?.find((p) => p.name === part.name) as ParametersParameter;
    expect(tablePart).toBeDefined();
    expect(tablePart).toMatchObject(part);
  }
}
