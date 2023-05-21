import { Observation, Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { getClient } from '../../database';
import { getRedis } from '../../redis';
import { createTestProject, initTestAuth } from '../../test.setup';
import { systemRepo } from '../repo';
import { SelectQuery, Operator as SqlOperator } from '../sql';
import { Expunger } from './expunge';

const app = express();
let superAdminAccessToken: string;

// TODO
describe.skip('Expunge', () => {
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
    await new Promise((r) => setTimeout(r, 200));
  });

  test('Expunger.expunge() expunges all resource types', async () => {
    //setup
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
    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: project.id },
      name: [{ given: ['Bob'], family: 'Smith' }],
    });
    const patient3 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: project.id },
      name: [{ given: ['Bob'], family: 'Smith' }],
    });
    expect(patient3).toBeDefined();

    const obs = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      meta: { project: project.id },
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
      subject: { reference: 'Patient/' + patient.id },
    });
    expect(obs).toBeDefined();

    expect(await existsInCache('Project', project.id)).toBe(true);
    expect(await existsInCache('ClientApplication', client.id)).toBe(true);
    expect(await existsInCache('ProjectMembership', membership.id)).toBe(true);
    expect(await existsInCache('Patient', patient.id)).toBe(true);
    expect(await existsInCache('Patient', patient2.id)).toBe(true);
    expect(await existsInCache('Patient', patient3.id)).toBe(true);
    expect(await existsInCache('Observation', obs.id)).toBe(true);

    //execute
    await new Expunger(systemRepo, project.id as string, 2).expunge();

    //result

    expect(await existsInDatabase('Project', project.id)).toBe(false);
    expect(await existsInDatabase('Project_History', project.id)).toBe(false);

    expect(await existsInDatabase('ClientApplication', client.id)).toBe(false);
    expect(await existsInDatabase('ClientApplication_History', client.id)).toBe(false);

    expect(await existsInDatabase('ProjectMembership', membership.id)).toBe(false);
    expect(await existsInDatabase('ProjectMembership_History', membership.id)).toBe(false);

    expect(await existsInDatabase('Patient', patient.id)).toBe(false);
    expect(await existsInDatabase('Patient_History', patient.id)).toBe(false);
    expect(await existsInDatabase('Patient', patient2.id)).toBe(false);
    expect(await existsInDatabase('Patient_History', patient2.id)).toBe(false);
    expect(await existsInDatabase('Patient', patient3.id)).toBe(false);
    expect(await existsInDatabase('Patient_History', patient3.id)).toBe(false);

    expect(await existsInDatabase('Observation', obs.id)).toBe(false);
    expect(await existsInDatabase('Observation_History', obs.id)).toBe(false);

    expect(await existsInCache('Project', project.id)).toBe(false);
    expect(await existsInCache('ClientApplication', client.id)).toBe(false);
    expect(await existsInCache('ProjectMembership', membership.id)).toBe(false);
    expect(await existsInCache('Patient', patient.id)).toBe(false);
    expect(await existsInCache('Patient', patient2.id)).toBe(false);
    expect(await existsInCache('Patient', patient3.id)).toBe(false);
    expect(await existsInCache('Observation', obs.id)).toBe(false);
  });
});

async function existsInCache(resourceType: string, id: string | undefined): Promise<boolean> {
  const redis = await getRedis().get(`${resourceType}/${id}`);
  return !!redis;
}

async function existsInDatabase(tableName: string, id: string | undefined): Promise<boolean> {
  const rows = await new SelectQuery(tableName).column('id').where('id', SqlOperator.EQUALS, id).execute(getClient());
  return rows.length > 0;
}
