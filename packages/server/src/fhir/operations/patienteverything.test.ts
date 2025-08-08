// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, LOINC, createReference, getReferenceString } from '@medplum/core';
import { Bundle, Condition, Observation, Organization, Patient, Practitioner, Resource } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
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
    // Create organization
    const orgRes = await request(app)
      .post(`/fhir/R4/Organization`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Organization' });
    expect(orgRes.status).toBe(201);
    const organization = orgRes.body as Organization;

    // Create practitioner
    const practRes = await request(app)
      .post(`/fhir/R4/Practitioner`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Practitioner' });
    expect(practRes.status).toBe(201);
    const practitioner = practRes.body as Practitioner;

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
        managingOrganization: createReference(organization),
      } satisfies Patient);
    expect(res1.status).toBe(201);
    const patient = res1.body as Patient;

    // Create observation
    const res2 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        subject: createReference(patient),
        performer: [createReference(practitioner), createReference(organization)],
      } satisfies Observation);
    expect(res2.status).toBe(201);
    const observation = res2.body as Observation;

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
        asserter: createReference(patient),
        subject: createReference(patient),
        recorder: createReference(practitioner),
      } satisfies Condition);
    expect(res3.status).toBe(201);
    const condition = res3.body as Condition;

    // Execute the operation
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);
    const result = res4.body as Bundle;
    expect(
      result.entry?.map((e) => `${e.search?.mode}:${getReferenceString(e.resource as Resource)}`).sort()
    ).toStrictEqual([
      'include:' + getReferenceString(organization),
      'include:' + getReferenceString(practitioner),
      'match:' + getReferenceString(condition),
      'match:' + getReferenceString(observation),
      'match:' + getReferenceString(patient),
    ]);

    // Create another observation
    const res5 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        subject: createReference(patient),
        performer: [createReference(practitioner), createReference(organization)],
      } satisfies Observation);
    expect(res5.status).toBe(201);
    const newObservation = res5.body as Observation;

    // Execute the operation with _since
    const res6 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything?_since=${newObservation.meta?.lastUpdated}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(200);
    const sinceResult = res6.body as Bundle;
    expect(
      sinceResult.entry?.map((e) => `${e.search?.mode}:${getReferenceString(e.resource as Resource)}`).sort()
    ).toStrictEqual([
      'include:' + getReferenceString(organization),
      'include:' + getReferenceString(practitioner),
      'match:' + getReferenceString(newObservation),
    ]);

    // Execute the operation with _count and _offset
    const res7 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything?_count=1&_offset=1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7.status).toBe(200);

    // Bundle should have pagination links
    const bundle = res7.body as Bundle;
    expect(bundle.link).toBeDefined();
    expect(bundle.link?.some((link) => link.relation === 'next')).toBeTruthy();
    expect(bundle.link?.some((link) => link.relation === 'first')).toBeTruthy();
    expect(bundle.link?.some((link) => link.relation === 'previous')).toBeTruthy();

    // Execute the operation with "start" and "end" parameters
    const res8 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything?start=2020-01-01&end=2040-01-01`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res8.status).toBe(200);
  });
});
