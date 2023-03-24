import { getReferenceString, isUUID, Operator } from '@medplum/core';
import { Observation, Patient, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { createTestProject, initTestAuth } from '../../test.setup';
import { systemRepo } from '../repo';

const app = express();

describe('Project clone', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Forbidden', async () => {
    const accessToken = await initTestAuth();
    const res = await request(app)
      .post(`/fhir/R4/Project/${randomUUID()}/$clone`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({});
    expect(res.status).toBe(403);
  });

  test('Success', async () => {
    const { project } = await createTestProject();
    expect(project).toBeDefined();

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

    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    expect(superAdminAccessToken).toBeDefined();

    const res = await request(app)
      .post(`/fhir/R4/Project/${project.id}/$clone`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({});
    expect(res.status).toBe(201);

    const newProjectId = res.body.id;
    expect(newProjectId).toBeDefined();
    expect(isUUID(newProjectId)).toBe(true);
    expect(newProjectId).not.toEqual(project.id);

    const newProject = await systemRepo.readResource<Project>('Project', newProjectId);
    expect(newProject).toBeDefined();

    const patientBundle = await systemRepo.search({
      resourceType: 'Patient',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(patientBundle).toBeDefined();
    expect(patientBundle.entry).toHaveLength(1);

    const obsBundle = await systemRepo.search({
      resourceType: 'Observation',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(obsBundle).toBeDefined();
    expect(obsBundle.entry).toHaveLength(1);
    expect((obsBundle.entry?.[0]?.resource as Observation).subject?.reference).toEqual(
      getReferenceString(patientBundle.entry?.[0]?.resource as Patient)
    );
  });
});
