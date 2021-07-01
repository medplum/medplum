import { Meta, Patient } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';
import { isOk } from './outcomes';
import { repo } from './repo';

const app = express();
let accessToken: string;
let testPatient: Patient;
let patientId: string;
let patientVersionId: string;

beforeAll(async () => {
  const config = await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
  await initApp(app);
  await initKeys(config);
  accessToken = await initTestAuth();

  const [outcome, patient] = await repo.createResource({
    resourceType: 'Patient',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  });

  expect(isOk(outcome)).toBe(true);
  testPatient = patient as Patient;
  patientId = testPatient.id as string;
  patientVersionId = (testPatient.meta as Meta).versionId as string;
});

afterAll(async () => {
  await closeDatabase();
});

test('Create batch', (done) => {
  request(app)
    .post(`/fhir/R4/`)
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', 'application/fhir+json')
    .send({ resourceType: 'Bundle', type: 'batch', entry: [] })
    .expect(200, done);
});

test('Create resource', (done) => {
  request(app)
    .post(`/fhir/R4/Patient`)
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', 'application/fhir+json')
    .send({ resourceType: 'Patient' })
    .expect(201)
    .end((err, res) => {
      const patient = res.body;
      request(app)
        .get(`/fhir/R4/Patient/` + patient.id)
        .set('Authorization', 'Bearer ' + accessToken)
        .expect(200, done);
    });
});

test('Create resource invalid resource type', (done) => {
  request(app)
    .post(`/fhir/R4/Patientx`)
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', 'application/fhir+json')
    .send({ resourceType: 'Patientx' })
    .expect(400, done);
});

test('Read resource', (done) => {
  request(app)
    .get(`/fhir/R4/Patient/${patientId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(200, done);
});

test('Read resource invalid UUID', (done) => {
  request(app)
    .get(`/fhir/R4/Patient/123`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Read resource invalid resource type', (done) => {
  request(app)
    .get(`/fhir/R4/Patientx/${patientId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Read resource not found', (done) => {
  request(app)
    .get(`/fhir/R4/Patient/8a54c7db-654b-4c3d-ba85-e0909f51c12c`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(404, done);
});

test('Read resource history', (done) => {
  request(app)
    .get(`/fhir/R4/Patient/${patientId}/_history`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(200, done);
});

test('Read resource history invalid UUID', (done) => {
  request(app)
    .get(`/fhir/R4/Patient/123/_history`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Read resource history invalid resource type', (done) => {
  request(app)
    .get(`/fhir/R4/xyz/${patientId}/_history`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Read resource version', (done) => {
  request(app)
    .get(`/fhir/R4/Patient/${patientId}/_history/${patientVersionId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(200, done);
});

test('Read resource version invalid UUID', (done) => {
  request(app)
    .get(`/fhir/R4/Patient/123/_history/${patientVersionId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Read resource version invalid version UUID', (done) => {
  request(app)
    .get(`/fhir/R4/Patient/${patientId}/_history/123`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Read resource version invalid resource type', (done) => {
  request(app)
    .get(`/fhir/R4/xyz/${patientId}/_history/${patientVersionId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Read resource version not found', (done) => {
  request(app)
    .get(`/fhir/R4/Patient/${patientId}/_history/${randomUUID()}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(404, done);
});

test('Update resource', (done) => {
  request(app)
    .put(`/fhir/R4/Patient/${patientId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({ resourceType: 'Patient', id: patientId })
    .expect(200, done);
});

test('Update resource invalid', (done) => {
  request(app)
    .put(`/fhir/R4/Patient/${patientId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({})
    .expect(400, done);
});

test('Update resource missing ID', (done) => {
  request(app)
    .put(`/fhir/R4/Patient/${patientId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({ resourceType: 'Patient' })
    .expect(400, done);
});

test('Update resource not found', (done) => {
  request(app)
    .put(`/fhir/R4/Patient/${randomUUID()}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({ resourceType: 'Patient' })
    .expect(400, done);
});

test('Delete resource', (done) => {
  request(app)
    .delete(`/fhir/R4/Patient/${patientId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(200, done);
});

test('Delete resource invalid UUID', (done) => {
  request(app)
    .delete(`/fhir/R4/Patient/123`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Delete resource invalid resource type', (done) => {
  request(app)
    .delete(`/fhir/R4/xyz/${patientId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Patch resource', (done) => {
  request(app)
    .patch(`/fhir/R4/Patient/${patientId}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({})
    .expect(200, done);
});

test('Search', (done) => {
  request(app)
    .get(`/fhir/R4/Patient`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(200, done);
});

test('Search invalid resource', (done) => {
  request(app)
    .get(`/fhir/R4/Patientx`)
    .set('Authorization', 'Bearer ' + accessToken)
    .expect(400, done);
});

test('Validate create success', (done) => {
  request(app)
    .post(`/fhir/R4/Patient/$validate`)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({ resourceType: 'Patient' })
    .expect(200, done);
});

test('Validate create failure', (done) => {
  request(app)
    .post(`/fhir/R4/Patient/$validate`)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({ resourceType: 'Patient', badProperty: 'bad' })
    .expect(400, done);
});
