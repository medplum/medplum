import { ContentType } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

describe('dbcolumnstatisticsupdate', () => {
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

  test('Success', async () => {
    const res1 = await request(app)
      .post('/fhir/R4/$db-column-statistics')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        tableName: 'AccessPolicy',
        columnNames: ['id', 'lastUpdated'],
        resetToDefault: false,
        newStatisticsTarget: 100,
      });
    expect(res1.status).toBe(200);
    expect(res1.body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'ok', valueBoolean: true }],
    });

    const res2 = await request(app)
      .post('/fhir/R4/$db-column-statistics')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        tableName: 'AccessPolicy',
        columnNames: ['id', 'lastUpdated'],
        resetToDefault: true,
        newStatisticsTarget: undefined,
      });
    expect(res2.status).toBe(200);
    expect(res2.body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'ok', valueBoolean: true }],
    });
  });

  describe('Validation errors', () => {
    test('Missing tableName', async () => {
      const res1 = await request(app)
        .post('/fhir/R4/$db-column-statistics')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({});
      expect(res1.status).toBe(400);
      expect(res1.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: expect.stringContaining('tableName') },
          },
        ],
      });
    });

    test('Missing columnNames', async () => {
      const res2 = await request(app)
        .post('/fhir/R4/$db-column-statistics')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ tableName: 'AccessPolicy', columnNames: [] });
      expect(res2.status).toBe(400);
      expect(res2.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: expect.stringContaining('columnNames') },
          },
        ],
      });
    });

    test('Missing resetToDefault', async () => {
      const res3 = await request(app)
        .post('/fhir/R4/$db-column-statistics')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ tableName: 'AccessPolicy', columnNames: ['id'] });
      expect(res3.status).toBe(400);
      expect(res3.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: expect.stringContaining('resetToDefault') },
          },
        ],
      });
    });

    test('Invalid tableName', async () => {
      const res1 = await request(app)
        .post('/fhir/R4/$db-column-statistics')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ tableName: 'Robert"; DROP TABLE Students;', columnNames: ['id'], resetToDefault: true });
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
        .post('/fhir/R4/$db-column-statistics')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ tableName: 'AccessPolicy', columnNames: ['id', 'invalid-column-name'], resetToDefault: true });
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
        .post('/fhir/R4/$db-column-statistics')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ tableName: 'AccessPolicy', columnNames: ['id'], resetToDefault: true, newStatisticsTarget: 100 });
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

    test('Missing newStatisticsTarget', async () => {
      const res = await request(app)
        .post('/fhir/R4/$db-column-statistics')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ tableName: 'AccessPolicy', columnNames: ['id'], resetToDefault: false });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: 'Missing newStatisticsTarget' },
          },
        ],
      });
    });

    test('Invalid newStatisticsTarget', async () => {
      const res = await request(app)
        .post('/fhir/R4/$db-column-statistics')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ tableName: 'AccessPolicy', columnNames: ['id'], resetToDefault: false, newStatisticsTarget: -1 });
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
