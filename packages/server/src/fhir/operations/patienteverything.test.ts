import { ContentType, LOINC, createReference } from '@medplum/core';
import { Bundle, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('Patient Everything Operation', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    // Create patient
    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        address: [{ use: 'home', line: ['123 Main St'], city: 'Anywhere', state: 'CA', postalCode: '90210' }],
        telecom: [
          { system: 'phone', value: '555-555-5555' },
          { system: 'email', value: 'alice@example.com' },
        ],
      });
    expect(res1.status).toBe(201);

    // Create observation
    const res2 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        subject: createReference(res1.body as Patient),
      });
    expect(res2.status).toBe(201);

    // Create condition
    // This condition references the patient twice, once as subject and once as asserter
    // This is to test that the condition is only returned once
    const res3 = await request(app)
      .post(`/fhir/R4/Condition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Condition',
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        asserter: createReference(res1.body as Patient),
        subject: createReference(res1.body as Patient),
      });
    expect(res3.status).toBe(201);

    // Execute the operation
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${res1.body.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);
    expect(res4.body.entry).toHaveLength(3);

    // Create another observation
    const res5 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        subject: createReference(res1.body as Patient),
      });
    expect(res5.status).toBe(201);

    // Execute the operation with _since
    const res6 = await request(app)
      .get(`/fhir/R4/Patient/${res1.body.id}/$everything?_since=${res5.body.meta?.lastUpdated}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(200);
    expect(res6.body.entry).toHaveLength(1);

    // Execute the operation with _count and _offset
    const res7 = await request(app)
      .get(`/fhir/R4/Patient/${res1.body.id}/$everything?_count=1&_offset=1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7.status).toBe(200);

    // Bundle should have pagination links
    const bundle = res7.body as Bundle;
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.link).toBeDefined();
    expect(bundle.link?.some((link) => link.relation === 'next')).toBeTruthy();
    expect(bundle.link?.some((link) => link.relation === 'first')).toBeTruthy();
    expect(bundle.link?.some((link) => link.relation === 'previous')).toBeTruthy();
  });
});
