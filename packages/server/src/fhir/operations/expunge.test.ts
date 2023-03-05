import { Observation, Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { getClient } from '../../database';
import { createTestProject, initTestAuth } from '../../test.setup';
import { systemRepo } from '../repo';
import { Operator as SqlOperator, SelectQuery } from '../sql';

const app = express();
let superAdminAccessToken: string;

describe('Expunge', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    superAdminAccessToken = await initTestAuth({ superAdmin: true });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Forbidden', async () => {
    const accessToken = await initTestAuth();
    const res = await request(app)
      .post(`/fhir/R4/Project/${randomUUID()}/$expunge`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({});
    expect(res.status).toBe(403);
  });

  test('Expunge single resource', async () => {
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });
    expect(patient).toBeDefined();

    // Expect the patient to be in the "Patient" and "Patient_History" tables
    expect(await existsInDatabase('Patient', patient.id)).toBe(true);
    expect(await existsInDatabase('Patient_History', patient.id)).toBe(true);

    // Expunge the resource
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$expunge`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({});
    expect(res.status).toBe(200);

    // Expect the patient to be removed from both tables
    expect(await existsInDatabase('Patient', patient.id)).toBe(false);
    expect(await existsInDatabase('Patient_History', patient.id)).toBe(false);
  });

  test('Expunge project compartment', async () => {
    const { project, client, membership } = await createTestProject();
    expect(project).toBeDefined();
    expect(client).toBeDefined();
    expect(membership).toBeDefined();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: project.id },
      name: [{ given: ['Alice'], family: 'Smith' }],
    });
    expect(patient).toBeDefined();

    const obs = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      meta: { project: project.id },
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
      subject: { reference: 'Patient/' + patient.id },
    });
    expect(obs).toBeDefined();

    // Expunge the project
    const res = await request(app)
      .post(`/fhir/R4/Project/${project.id}/$expunge?everything=true`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({});
    expect(res.status).toBe(200);

    expect(await existsInDatabase('Project', patient.id)).toBe(false);
    expect(await existsInDatabase('Project_History', patient.id)).toBe(false);

    expect(await existsInDatabase('ClientApplication', client.id)).toBe(false);
    expect(await existsInDatabase('ClientApplication_History', client.id)).toBe(false);

    expect(await existsInDatabase('ProjectMembership', membership.id)).toBe(false);
    expect(await existsInDatabase('ProjectMembership_History', membership.id)).toBe(false);

    expect(await existsInDatabase('Patient', patient.id)).toBe(false);
    expect(await existsInDatabase('Patient_History', patient.id)).toBe(false);

    expect(await existsInDatabase('Observation', obs.id)).toBe(false);
    expect(await existsInDatabase('Observation_History', obs.id)).toBe(false);
  });
});

async function existsInDatabase(tableName: string, id: string | undefined): Promise<boolean> {
  const rows = await new SelectQuery(tableName).column('id').where('id', SqlOperator.EQUALS, id).execute(getClient());
  return rows.length > 0;
}
