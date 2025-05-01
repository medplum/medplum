import { ContentType } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';
import { ParametersParameter } from '@medplum/fhirtypes';

describe('dbcolumnstatisticslookup', () => {
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

  test('Success without tableName', async () => {
    const res = await request(app)
      .get('/fhir/R4/$db-column-statistics?tableName=')
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
      .get('/fhir/R4/$db-column-statistics?tableName=Patient')
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

  test('Invalid tableName', async () => {
    const res = await request(app)
      .get(`/fhir/R4/$db-column-statistics?tableName=${encodeURIComponent('Robert"; DROP TABLE Students;')}`)
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

function expectColumn(tableParam: ParametersParameter | undefined, name: string): void {
  expect(tableParam).toMatchObject({
    name: 'table',
    part: expect.arrayContaining([
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
          {
            name: 'nullFraction',
            valueDecimal: expect.any(Number),
          },
        ]),
      }),
    ]),
  });
}
