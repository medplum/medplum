// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, ContentType } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { GLOBAL_SHARD_ID } from '../../sharding/sharding-utils';
import { initTestAuth } from '../../test.setup';

describe('dbcolumnstatisticsupdate', () => {
  const app = express();
  const shardId = GLOBAL_SHARD_ID;
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ project: { superAdmin: true } });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const CONFIGURE_URL = '/fhir/R4/$db-configure-column-statistics';

  test('Success', async () => {
    const res1 = await request(app)
      .post(CONFIGURE_URL)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        shardId,
        tableName: 'AccessPolicy',
        columnNames: ['id', 'lastUpdated'],
        resetToDefault: false,
        newStatisticsTarget: 100,
      });
    expect(res1.status).toBe(200);
    expect(res1.body).toMatchObject(allOk);

    const res2 = await request(app)
      .post(CONFIGURE_URL)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        shardId,
        tableName: 'AccessPolicy',
        columnNames: ['id', 'lastUpdated'],
        resetToDefault: true,
        newStatisticsTarget: undefined,
      });
    expect(res2.status).toBe(200);
    expect(res1.body).toMatchObject(allOk);
  });

  describe('Validation errors', () => {
    test.each(['shardId', 'tableName', 'columnNames', 'resetToDefault', 'newStatisticsTarget'])(
      'Missing %s',
      async (missingField) => {
        const body: any = { shardId, tableName: 'AccessPolicy', columnNames: ['id'], resetToDefault: true };

        // only required when resetToDefault is false
        if (missingField === 'newStatisticsTarget') {
          body.resetToDefault = false;
        }

        delete body[missingField];

        const res1 = await request(app)
          .post(CONFIGURE_URL)
          .set('Authorization', 'Bearer ' + accessToken)
          .set('Content-Type', ContentType.FHIR_JSON)
          .send(body);
        expect(res1.status).toBe(400);
        expect(res1.body).toMatchObject({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              details: { text: expect.stringContaining(missingField) },
            },
          ],
        });
      }
    );

    test('Invalid tableName', async () => {
      const res1 = await request(app)
        .post(CONFIGURE_URL)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ shardId, tableName: 'Robert"; DROP TABLE Students;', columnNames: ['id'], resetToDefault: true });
      expect(res1.status).toBe(400);
      expect(res1.body).toMatchObject({
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

    test('Invalid columnName', async () => {
      const res = await request(app)
        .post(CONFIGURE_URL)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ shardId, tableName: 'AccessPolicy', columnNames: ['id', 'invalid-column-name'], resetToDefault: true });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: 'Invalid columnName' },
          },
        ],
      });
    });

    test('Both resetToDefault and newStatisticsTarget', async () => {
      const res = await request(app)
        .post(CONFIGURE_URL)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          shardId,
          tableName: 'AccessPolicy',
          columnNames: ['id'],
          resetToDefault: true,
          newStatisticsTarget: 100,
        });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: 'Cannot specify newStatisticsTarget when resetToDefault is true' },
          },
        ],
      });
    });

    test('Invalid newStatisticsTarget', async () => {
      const res = await request(app)
        .post(CONFIGURE_URL)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          shardId,
          tableName: 'AccessPolicy',
          columnNames: ['id'],
          resetToDefault: false,
          newStatisticsTarget: -1,
        });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: 'newStatisticsTarget must be between 100 and 10000' },
          },
        ],
      });
    });
  });
});
