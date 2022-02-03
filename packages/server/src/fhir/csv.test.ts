import { Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();
let accessToken: string;
let testPatient: Patient;

describe('CSV Export', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
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
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Success', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/$csv`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.text).toContain(testPatient.id);
  });

  test('Invalid resource type', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patientx`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });
});
