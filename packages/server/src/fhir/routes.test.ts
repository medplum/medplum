import { getReferenceString } from '@medplum/core';
import { Meta, Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { initTestAuth } from '../test.setup';

const app = express();
let accessToken: string;
let testPatient: Patient;
let patientId: string;
let patientVersionId: string;

describe('FHIR Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();

    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      });
    expect(res.status).toBe(201);
    testPatient = res.body as Patient;
    patientId = testPatient.id as string;
    patientVersionId = (testPatient.meta as Meta).versionId as string;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get CapabilityStatement anonymously', async () => {
    const res = await request(app).get(`/fhir/R4/metadata`);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toEqual('CapabilityStatement');
  });

  test('Get CapabilityStatement authenticated', async () => {
    const res = await request(app)
      .get(`/fhir/R4/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toEqual('CapabilityStatement');
  });

  test('Get SMART-on-FHIR configuration', async () => {
    const res = await request(app).get(`/fhir/R4/.well-known/smart-configuration`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');

    // Required fields: https://build.fhir.org/ig/HL7/smart-app-launch/conformance.html#response
    expect(res.body.authorization_endpoint).toBeDefined();
    expect(res.body.grant_types_supported).toBeDefined();
    expect(res.body.token_endpoint).toBeDefined();
    expect(res.body.capabilities).toBeDefined();
    expect(res.body.code_challenge_methods_supported).toBeDefined();

    const res2 = await request(app).get(`/fhir/R4/.well-known/smart-styles.json`);
    expect(res2.status).toBe(200);
    expect(res2.headers['content-type']).toEqual('application/json; charset=utf-8');
  });

  test('Invalid JSON', async () => {
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send('not-json');
    expect(res.status).toBe(400);
  });

  test('Create batch', async () => {
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Bundle', type: 'batch', entry: [] });
    expect(res.status).toBe(200);
  });

  test('Create batch wrong content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Create batch wrong resource type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Patient', name: [{ given: ['Homer'] }] });
    expect(res.status).toBe(400);
  });

  test('Create resource success', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .get(`/fhir/R4/Patient/` + patient.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
  });

  test('Create resource invalid resource type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patientx`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Patientx' });
    expect(res.status).toBe(400);
  });

  test('Create resource incorrect resource type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Patientx' });
    expect(res.status).toBe(400);
  });

  test('Create resource invalid content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Read resourcex', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Read resource invalid UUID', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource invalid resource type', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patientx/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Read resource not found', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/8a54c7db-654b-4c3d-ba85-e0909f51c12c`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource minimal', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Prefer', 'return=minimal');
    expect(res.status).toBe(200);
    expect(res.text).toEqual('');
  });

  test('Read resource history', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}/_history`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Read resource history invalid UUID', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/123/_history`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource history invalid resource type', async () => {
    const res = await request(app)
      .get(`/fhir/R4/xyz/${patientId}/_history`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Read resource version', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}/_history/${patientVersionId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Read resource version invalid UUID', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/123/_history/${patientVersionId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource version invalid version UUID', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}/_history/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource version invalid resource type', async () => {
    const res = await request(app)
      .get(`/fhir/R4/xyz/${patientId}/_history/${patientVersionId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Read resource version not found', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}/_history/${randomUUID()}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Update resource', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .put(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ ...patient, active: true });
    expect(res2.status).toBe(200);
  });

  test('Update resource not modified', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .put(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(patient);
    expect(res2.status).toBe(200);
    expect(res2.body.meta.versionId).toEqual(patient.meta.versionId);
  });

  test('Update resource not modified with empty strings', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Patient',
        managingOrganization: {
          reference: 'Organization/123',
        },
      });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .put(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        ...patient,
        managingOrganization: {
          reference: 'Organization/123',
          display: '',
        },
      });
    expect(res2.status).toBe(200);
    expect(res2.body.meta.versionId).toEqual(patient.meta.versionId);
  });

  test('Update resource invalid', async () => {
    const res = await request(app)
      .put(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res.status).toBe(400);
  });

  test('Update resource wrong content-type', async () => {
    const res = await request(app)
      .put(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Update resource missing ID', async () => {
    const res = await request(app)
      .put(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(400);
  });

  test('Update resource not found', async () => {
    const res = await request(app)
      .put(`/fhir/R4/Patient/${randomUUID()}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(400);
  });

  test('Delete resource', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .delete(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    const res3 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(410);
  });

  test('Delete resource invalid UUID', async () => {
    const res = await request(app)
      .delete(`/fhir/R4/Patient/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Delete resource invalid resource type', async () => {
    const res = await request(app)
      .delete(`/fhir/R4/xyz/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Patch resource not found', async () => {
    const res = await request(app)
      .patch(`/fhir/R4/Patient/${randomUUID()}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json-patch+json')
      .send([
        {
          op: 'add',
          path: '/generalPractitioner',
          value: [{ reference: 'Practitioner/123' }],
        },
      ]);
    expect(res.status).toBe(404);
  });

  test('Patch resource wrong content type', async () => {
    const res = await request(app)
      .patch(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Patch resource invalid result', async () => {
    const res = await request(app)
      .patch(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json-patch+json')
      .send([{ op: 'remove', path: '/resourceType' }]);
    expect(res.status).toBe(400);
  });

  test('Patch resource success', async () => {
    const res = await request(app)
      .patch(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json-patch+json')
      .send([
        {
          op: 'add',
          path: '/generalPractitioner',
          value: [{ reference: 'Practitioner/123' }],
        },
      ]);
    expect(res.status).toBe(200);
  });

  test('Search', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Search invalid resource', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patientx`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Search invalid search parameter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ServiceRequest?basedOn=ServiceRequest/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Unknown search parameter: basedOn');
  });

  test('Search by POST', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/_search`)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('form');
    expect(res.status).toBe(200);
  });

  test('Validate create success', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/$validate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(200);
  });

  test('Validate create failure', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/$validate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient', badProperty: 'bad' });
    expect(res.status).toBe(400);
  });

  test('Validate wrong content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/$validate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Reindex resource access denied', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patientId}/$reindex`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res.status).toBe(403);
  });

  test('Resend subscriptions access denied', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patientId}/$resend`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res.status).toBe(403);
  });

  test('Resend as project admin', async () => {
    const { profile, accessToken } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

    const res = await request(app)
      .post(`/fhir/R4/${getReferenceString(profile)}/$resend`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res.status).toBe(200);
  });
});
