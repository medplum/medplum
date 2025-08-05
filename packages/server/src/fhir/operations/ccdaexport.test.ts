// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, LOINC, WithId, createReference } from '@medplum/core';
import { Condition, Observation, Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';
import { OBSERVATION_CATEGORY_SYSTEM } from './patientsummary';

const app = express();
let accessToken: string;

describe('C-CDA Export', () => {
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
        category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'vital-signs' }] }],
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        subject: createReference(patient),
        performer: [createReference(practitioner), createReference(organization)],
        effectiveDateTime: new Date().toISOString(),
      } satisfies Observation);
    expect(res2.status).toBe(201);
    const observation = res2.body as WithId<Observation>;

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
        recordedDate: new Date().toISOString(),
      } satisfies Condition);
    expect(res3.status).toBe(201);
    const condition = res3.body as WithId<Condition>;

    // Execute the operation
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$ccda-export`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', ContentType.CDA_XML);
    expect(res4.status).toBe(200);

    const result = res4.text;
    expect(result.includes('<given>Alice</given>')).toBe(true);
    expect(result.includes(observation.id)).toBe(true);
    expect(result.includes(condition.id)).toBe(true);
  });
});
