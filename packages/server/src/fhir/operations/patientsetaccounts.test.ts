// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { Bundle, Communication, DiagnosticReport, Observation, Organization, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';
import { patientSetAccountsHandler } from './patientsetaccounts';

const app = express();
let accessToken: string;
let observation: Observation;
let diagnosticReport: DiagnosticReport;
let patient: Patient;
let organization1: Organization;
let organization2: Organization;

describe('Patient Set Accounts Operation', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ superAdmin: true });

    // Create organization
    const orgRes = await request(app)
      .post('/fhir/R4/Organization')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Organization' });
    expect(orgRes.status).toBe(201);
    organization1 = orgRes.body as Organization;

    const orgRes2 = await request(app)
      .post('/fhir/R4/Organization')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Organization' });
    expect(orgRes2.status).toBe(201);
    organization2 = orgRes2.body as Organization;

    // Create patient
    const res1 = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      } satisfies Patient);
    expect(res1.status).toBe(201);
    patient = res1.body as Patient;

    // Create observation
    const res2 = await request(app)
      .post('/fhir/R4/Observation')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: 'test-code',
            },
          ],
        },
        subject: createReference(patient),
      } satisfies Observation);
    expect(res2.status).toBe(201);
    observation = res2.body as Observation;

    //Create a diagnostic report
    const res3 = await request(app)
      .post('/fhir/R4/DiagnosticReport')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'DiagnosticReport',
        subject: createReference(patient),
        status: 'final',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: 'test-code',
            },
          ],
        },
      } satisfies DiagnosticReport);
    expect(res3.status).toBe(201);
    diagnosticReport = res3.body as DiagnosticReport;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Happy path', async () => {
    // Execute the operation adding the organization to the patient's compartment
    const res3 = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'accounts',
            valueReference: createReference(organization1),
          },
          {
            name: 'accounts',
            valueReference: createReference(organization2),
          },
        ],
      });
    expect(res3.status).toBe(200);
    const result = res3.body;
    expect(result.parameter?.[0].name).toBe('resourcesUpdated');
    expect(result.parameter?.[0].valueInteger).toBe(3); // Observation and DiagnosticReport

    //check if the accounts are updated on the patient
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);
    const updatedPatient = res4.body as Patient;
    expect(updatedPatient.meta?.accounts).toBeDefined();
    expect(updatedPatient.meta?.accounts?.[0].reference).toBe(`Organization/${organization1.id}`);
    expect(updatedPatient.meta?.accounts?.[1].reference).toBe(`Organization/${organization2.id}`);

    // Check if accounts are updated on the observation
    const res5 = await request(app)
      .get(`/fhir/R4/Observation/${observation.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5.status).toBe(200);
    const updatedObservation = res5.body as Observation;
    expect(updatedObservation.meta?.accounts).toBeDefined();
    expect(updatedObservation.meta?.accounts?.[0].reference).toBe(`Organization/${organization1.id}`);
    expect(updatedObservation.meta?.accounts?.[1].reference).toBe(`Organization/${organization2.id}`);

    // Check if accounts are updated on the diagnostic report
    const res6 = await request(app)
      .get(`/fhir/R4/DiagnosticReport/${diagnosticReport.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(200);
    const updatedDiagnosticReport = res6.body as DiagnosticReport;
    expect(updatedDiagnosticReport.meta?.accounts).toBeDefined();
    expect(updatedDiagnosticReport.meta?.accounts?.[0].reference).toBe(`Organization/${organization1.id}`);
    expect(updatedDiagnosticReport.meta?.accounts?.[1].reference).toBe(`Organization/${organization2.id}`);
  });

  test("Make sure resources returned in $patient-everything that are NOT in the patient's compartment are not updated", async () => {
    const res7 = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'accounts',
            valueReference: createReference(organization1),
          },
          {
            name: 'accounts',
            valueReference: createReference(organization2),
          },
        ],
      });
    expect(res7.status).toBe(200);
    const numberResourcesUpdated = res7.body.parameter?.[0].valueInteger;

    const res = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    const everything = res.body as Bundle;
    const allResources = everything.entry?.length ?? 0;
    const resourcesNotInCompartment = everything.entry?.filter((entry) => entry?.search?.mode !== 'match').length ?? 0;

    //Number of resources updated only includes the ones in the compartment, not other resources returned in $patient-everything
    expect(numberResourcesUpdated).toBe(allResources - resourcesNotInCompartment);
  });

  test('Patient not found', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/not-found/$set-accounts`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'accounts',
            valueReference: createReference(organization1),
          },
        ],
      });
    expect(res.status).toBe(404);
  });

  test('patientSetAccountsHandler() called without an id', async () => {
    const res = await patientSetAccountsHandler({
      params: { id: '' },
      method: 'POST',
      url: '/fhir/R4/Patient/$set-accounts',
      pathname: '/fhir/R4/Patient/$set-accounts',
      body: {},
      query: {},
    });
    expect(res[0].issue?.[0]?.details?.text).toBe('Must specify Patient ID');
  });

  test("Do not delete a resource in patient's compartment's meta.security field when set-accounts is called", async () => {
    //Create a Communication in Patient's compartment with a security tag
    const res1 = await request(app)
      .post(`/fhir/R4/Communication`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Communication',
        subject: createReference(patient),
        status: 'completed',
        meta: {
          security: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
              code: 'N',
            },
          ],
        },
      } satisfies Communication);

    expect(res1.status).toBe(201);
    const communication = res1.body as Communication;
    expect(communication.meta?.security).toBeDefined();

    const res2 = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('x-medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'accounts',
            valueReference: createReference(organization1),
          },
        ],
      });
    expect(res2.status).toBe(200);

    const res4 = await request(app)
      .get(`/fhir/R4/Communication/${communication.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);
    const updatedCommunication = res4.body as Communication;
    expect(updatedCommunication.meta?.accounts).toHaveLength(1);
    expect(updatedCommunication.meta?.security).toBeDefined();
  });

  test('Non admin user trying to set accounts', async () => {
    accessToken = await initTestAuth();
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [],
      });
    expect(res.status).toBe(403);
  });
});
