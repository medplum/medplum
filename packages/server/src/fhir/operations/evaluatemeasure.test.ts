import { ContentType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('Measure evaluate-measure', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Happy path', async () => {
    // 0. Create patients
    // 1. Create a Measure
    // 2. Invoke $evaluate-measure
    // 3. Verify the MeasureReport

    // 0. Create patients
    for (let i = 0; i < 10; i++) {
      const patientResponse = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Patient',
          active: true,
          gender: i % 2 === 0 ? 'male' : 'female',
        });
      expect(patientResponse.status).toBe(201);
    }

    // 1. Create a Measure
    const res1 = await request(app)
      .post(`/fhir/R4/Measure`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Measure',
        status: 'active',
        url: 'https://example.com/test-measure',
        group: [
          {
            population: [
              {
                code: { coding: [{ code: 'denominator' }] },
                criteria: {
                  language: 'application/x-fhir-query',
                  expression: 'Patient',
                },
              },
              {
                code: { coding: [{ code: 'numerator' }] },
                criteria: {
                  language: 'application/x-fhir-query',
                  expression: 'Patient?gender=female',
                },
              },
            ],
          },
        ],
      });
    expect(res1.status).toBe(201);

    // 2. Invoke $evaluate-measure
    const res2 = await request(app)
      .post(`/fhir/R4/Measure/${res1.body.id}/$evaluate-measure`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'periodStart',
            valueDate: '2020-01-01',
          },
          {
            name: 'periodEnd',
            valueDate: '2030-01-01',
          },
        ],
      });
    expect(res2.status).toBe(201);
    expect(res2.body.resourceType).toBe('MeasureReport');
    expect(res2.body.group?.[0].population).toHaveLength(2);
    expect(res2.body.group?.[0].population?.[0].count).toEqual(10);
    expect(res2.body.group?.[0].population?.[1].count).toEqual(5);

    // 3. Verify the MeasureReport
    const res3 = await request(app)
      .get(`/fhir/R4/MeasureReport/${res2.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.resourceType).toBe('MeasureReport');
    expect(res3.body.group?.[0].population).toHaveLength(2);
    expect(res3.body.group?.[0].population?.[0].count).toEqual(10);
    expect(res3.body.group?.[0].population?.[1].count).toEqual(5);
  });

  test('Unsupported content type', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/Measure`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Measure',
        status: 'active',
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/fhir/R4/Measure/${res1.body.id}/$evaluate-measure`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res2.status).toBe(400);
    expect((res2.body as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      "Expected at least 1 value(s) for required input parameter 'periodStart'"
    );
  });

  test('Unsupported parameters type', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/Measure`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Measure',
        status: 'active',
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/fhir/R4/Measure/${res1.body.id}/$evaluate-measure`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
      });
    expect(res2.status).toBe(400);
    expect((res2.body as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      "Expected at least 1 value(s) for required input parameter 'periodStart'"
    );
  });

  test('Missing period', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/Measure`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Measure',
        status: 'active',
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/fhir/R4/Measure/${res1.body.id}/$evaluate-measure`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'periodEnd',
            valueDate: '2030-01-01',
          },
        ],
      });
    expect(res2.status).toBe(400);
    expect((res2.body as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Expected 1 value(s) for input parameter periodStart, but 0 provided'
    );

    const res3 = await request(app)
      .post(`/fhir/R4/Measure/${res1.body.id}/$evaluate-measure`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'periodStart',
            valueDate: '2020-01-01',
          },
        ],
      });
    expect(res3.status).toBe(400);
    expect((res3.body as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Expected 1 value(s) for input parameter periodEnd, but 0 provided'
    );
  });
});
