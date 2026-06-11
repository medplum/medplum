// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, LOINC } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getCacheRedis } from '../../redis';
import { createTestProject, initTestAuth, waitForAsyncJob, withTestContext } from '../../test.setup';
import { getGlobalSystemRepo } from '../repo';
import { SelectQuery } from '../sql';
import { Expunger } from './expunge';

const systemRepo = getGlobalSystemRepo();

describe('Expunge', () => {
  const app = express();
  let superAdminAccessToken: string;

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
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(403);
  });

  test('Expunge single resource', async () => {
    const patient = await withTestContext(() =>
      systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      })
    );
    expect(patient).toBeDefined();

    // Expect the patient to be in the "Patient" and "Patient_History" tables
    expect(await existsInDatabase('Patient', patient.id)).toBe(true);
    expect(await existsInDatabase('Patient_History', patient.id)).toBe(true);
    expect(await existsInLookupTable('HumanName', patient.id)).toBe(true);

    // Expunge the resource
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$expunge`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    expect(res.status).toBe(200);

    // Expect the patient to be removed from both tables
    expect(await existsInDatabase('Patient', patient.id)).toBe(false);
    expect(await existsInDatabase('Patient_History', patient.id)).toBe(false);
    // Also expect lookup table to be cleaned up
    expect(await existsInLookupTable('HumanName', patient.id)).toBe(false);
  });

  test.each([
    { name: 'super admin', project: 'linked', superAdmin: true, outcome: 'success' },
    { name: 'super admin', project: 'main', superAdmin: true, outcome: 'success' },
    { name: 'project admin', project: 'linked', membership: { admin: true }, outcome: 'failure' },
    { name: 'project admin', project: 'main', membership: { admin: true }, outcome: 'success' },
    { name: 'non-admin', project: 'linked', membership: { admin: false }, outcome: 'failure' },
    { name: 'non-admin', project: 'main', membership: { admin: false }, outcome: 'failure' },
  ])('Expunge $project project as $name $outcome', async (opts) => {
    const {
      project: linkedProject,
      client: linkedClient,
      membership: linkedMembership,
      repo: linkedRepo,
    } = await createTestProject({
      withClient: true,
      withRepo: true,
      membership: { admin: true },
    });

    const { project, client, membership, accessToken } = await createTestProject({
      withClient: true,
      withAccessToken: true,
      membership: opts.membership,
      project: { link: [{ project: createReference(linkedProject) }] },
    });

    const linkedPatient = await linkedRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: linkedProject.id },
      name: [{ given: ['Linked'], family: 'Patient' }],
    });

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: project.id },
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    const linkedObs = await linkedRepo.createResource<Observation>({
      resourceType: 'Observation',
      meta: { project: linkedProject.id },
      status: 'final',
      code: { coding: [{ system: LOINC, code: '12345-6' }] },
      subject: { reference: 'Patient/' + linkedPatient.id },
    });

    const obs = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      meta: { project: project.id },
      status: 'final',
      code: { coding: [{ system: LOINC, code: '12345-6' }] },
      subject: { reference: 'Patient/' + patient.id },
    });

    const projectToExpunge = opts.project === 'linked' ? linkedProject : project;
    const accessTokenToUse = opts.superAdmin ? superAdminAccessToken : accessToken;

    // Expunge the project
    const res = await request(app)
      .post(`/fhir/R4/Project/${projectToExpunge.id}/$expunge?everything=true`)
      .set('Authorization', 'Bearer ' + accessTokenToUse)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    if (opts.outcome === 'success') {
      expect(res.status).toBe(202);

      // Project expunge destroys the caller's client/membership; poll with super admin credentials.
      const pollAccessToken = opts.superAdmin ? accessTokenToUse : superAdminAccessToken;
      await waitForAsyncJob(res.headers['content-location'], app, pollAccessToken);

      const mainResourcesExists = opts.project === 'linked';
      const linkedResourcesExist = opts.project === 'main';

      expect(await existsInDatabase('Patient', patient.id)).toBe(mainResourcesExists);
      expect(await existsInDatabase('Observation', obs.id)).toBe(mainResourcesExists);
      expect(await existsInDatabase('Project', project.id)).toBe(mainResourcesExists);
      expect(await existsInDatabase('ClientApplication', client.id)).toBe(mainResourcesExists);
      expect(await existsInDatabase('ProjectMembership', membership.id)).toBe(mainResourcesExists);

      expect(await existsInDatabase('Patient', linkedPatient.id)).toBe(linkedResourcesExist);
      expect(await existsInDatabase('Observation', linkedObs.id)).toBe(linkedResourcesExist);
      expect(await existsInDatabase('Project', linkedProject.id)).toBe(linkedResourcesExist);
      expect(await existsInDatabase('ClientApplication', linkedClient.id)).toBe(linkedResourcesExist);
      expect(await existsInDatabase('ProjectMembership', linkedMembership.id)).toBe(linkedResourcesExist);
    } else {
      expect(res.status).toBe(403);
    }
  });

  test('Project admin can expunge patient everything within own project', async () => {
    const { project, accessToken } = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
    });

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: project.id },
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    const obs = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      meta: { project: project.id },
      status: 'final',
      code: { coding: [{ system: LOINC, code: '12345-6' }] },
      subject: { reference: 'Patient/' + patient.id },
    });

    expect(await existsInDatabase('Patient', patient.id)).toBe(true);
    expect(await existsInDatabase('Observation', obs.id)).toBe(true);

    const res = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$expunge?everything=true`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    expect(res.status).toBe(202);

    const asyncJob = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
    // The job must complete cleanly: the Expunger iterates every resource type, and
    // must skip the ones a project admin cannot search rather than erroring out.
    expect(asyncJob.status).toBe('completed');

    // Both the patient and its compartment resources should be expunged
    expect(await existsInDatabase('Patient', patient.id)).toBe(false);
    expect(await existsInDatabase('Observation', obs.id)).toBe(false);
  });

  test('Project admin cannot expunge patient everything in another project', async () => {
    // Patient belongs to an unrelated project
    const { project: otherProject } = await createTestProject({});
    const otherPatient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: otherProject.id },
      name: [{ given: ['Bob'], family: 'Jones' }],
    });

    const { accessToken } = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
    });

    const res = await request(app)
      .post(`/fhir/R4/Patient/${otherPatient.id}/$expunge?everything=true`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    // The async job is accepted, but the project-scoped repo never finds the
    // foreign patient, so it is left untouched.
    expect(res.status).toBe(202);

    await waitForAsyncJob(res.headers['content-location'], app, accessToken);

    expect(await existsInDatabase('Patient', otherPatient.id)).toBe(true);
  });

  test('Expunger.expunge() expunges all resource types', async () => {
    //setup
    const { project, client, membership } = await createTestProject({ withClient: true });
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
      code: { coding: [{ system: LOINC, code: '12345-6' }] },
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
    await new Expunger(systemRepo, project.id, 2).expunge();

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
  const redis = await getCacheRedis().get(`${resourceType}/${id}`);
  return !!redis;
}

async function existsInDatabase(tableName: string, id: string | undefined): Promise<boolean> {
  const rows = await new SelectQuery(tableName)
    .column('id')
    .where('id', '=', id)
    .execute(getDatabasePool(DatabaseMode.READER));
  return rows.length > 0;
}

async function existsInLookupTable(tableName: string, id: string | undefined): Promise<boolean> {
  const rows = await new SelectQuery(tableName)
    .column('resourceId')
    .where('resourceId', '=', id)
    .execute(getDatabasePool(DatabaseMode.READER));
  return rows.length > 0;
}
