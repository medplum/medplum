import { ContentType, createReference } from '@medplum/core';
import { Observation, Organization, Patient, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';
import { patientUpdateAccountHandler } from './patientupdateaccounts';

const app = express();
let accessToken: string;
let observation: Observation;
let patient: Patient;
let organization: Organization;

describe('Patient Update Accounts Operation', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Happy path', async () => {
    // Create organization
    const orgRes = await request(app)
      .post(`/fhir/R4/Organization`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Organization' });
    expect(orgRes.status).toBe(201);
    organization = orgRes.body as Organization;

    // Create patient
    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }]
      } satisfies Patient);
    expect(res1.status).toBe(201);
    patient = res1.body as Patient;

    // Create observation
    const res2 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: 'test-code'
          }]
        },
        subject: createReference(patient),
        performer: [createReference(organization)],
      } satisfies Observation);
    expect(res2.status).toBe(201);

    //save the observation id
    observation = res2.body as Observation;

    // Update patient with compartment and accounts
    const res3 = await request(app)
      .put(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        ...patient, // Include all existing patient data
        meta: {
          ...patient.meta, // Preserve existing meta data if any
          compartment: [
            { reference: createReference(organization).reference },
          ],
          accounts: [
            { reference: createReference(organization).reference },
          ],
        },
      });

    expect(res3.status).toBe(200);

    patient = res3.body as Patient;

    // Execute the operation
    const res4 = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$update-accounts`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);

    const result = res4.body as Parameters;
    expect(result.parameter?.[0].name).toBe('resourcesUpdated');
    expect(result.parameter?.[0].valueInteger).toBe(1); //The single observation resource was updated

    // Check if observation's meta.compartment now contains the organization that was added to the patient
    const res5 = await request(app)
      .get(`/fhir/R4/Observation/${observation.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5.status).toBe(200);
    const updatedObservation = res5.body as Observation;

    //Finally, check if the observation meta.accounts contains the organization
    expect(updatedObservation.meta?.accounts).toEqual([{reference: createReference(organization).reference}]);
  });

  test("Patient with an invalid id", async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/101010101/$update-accounts`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect(res.body.issue?.[0]?.details?.text).toBe('Error updating patient compartment resources: Not found');
  });

  test("patientUpdateAccountHandler() called without an id", async () => {
    const res = await patientUpdateAccountHandler({params: {id: ''}, method: 'POST', url: '/fhir/R4/Patient/$update-accounts', pathname: '/fhir/R4/Patient/$update-accounts', body: {}, query: {}});
    expect(res[0].issue?.[0]?.details?.text).toBe('Must specify Patient ID');
  });
});