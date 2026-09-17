// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, LOINC } from '@medplum/core';
import type { AuditEvent, Observation, Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getCacheRedis } from '../../redis';
import {
  createTestProject,
  getSuperAdminAccessToken,
  initTestAuth,
  waitForAsyncJob,
  withTestContext,
} from '../../test.setup';
import { isExpungedHistoryVersion } from '../repository/row-builder';
import { getTestProjectSystemRepo } from '../repository/test-utils';
import { SelectQuery } from '../sql';
import { Expunger } from './expunge';

describe('Expunge', () => {
  const app = express();
  let superAdminAccessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    superAdminAccessToken = await getSuperAdminAccessToken();
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
    expect(res).toHaveStatus(403);
  });

  test('Expunge single resource', async () => {
    const systemRepo = getTestProjectSystemRepo();
    const patient = await withTestContext(() =>
      systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      })
    );

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
    expect(res).toHaveStatus(200);

    await expectExpungeTombstone('Patient', patient.id);
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

    const { project, client, membership, accessToken, repo } = await createTestProject({
      withClient: true,
      withAccessToken: true,
      withRepo: true,
      membership: opts.membership,
      project: { link: [{ project: createReference(linkedProject) }] },
    });

    const linkedPatient = await linkedRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Linked'], family: 'Patient' }],
    });

    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    const linkedObs = await linkedRepo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: LOINC, code: '12345-6' }] },
      subject: { reference: 'Patient/' + linkedPatient.id },
    });

    const obs = await repo.createResource<Observation>({
      resourceType: 'Observation',
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
      expect(res).toHaveStatus(202);

      // Project expunge destroys the caller's client/membership; poll with super admin credentials.
      const pollAccessToken = opts.superAdmin ? accessTokenToUse : superAdminAccessToken;
      await waitForAsyncJob(res.headers['content-location'], app, pollAccessToken);

      const mainResourcesExists = opts.project === 'linked';
      const linkedResourcesExist = opts.project === 'main';

      await expectExpungeOutcome('Patient', patient.id, mainResourcesExists);
      await expectExpungeOutcome('Observation', obs.id, mainResourcesExists);
      await expectExpungeOutcome('Project', project.id, mainResourcesExists);
      await expectExpungeOutcome('ClientApplication', client.id, mainResourcesExists);
      await expectExpungeOutcome('ProjectMembership', membership.id, mainResourcesExists);

      await expectExpungeOutcome('Patient', linkedPatient.id, linkedResourcesExist);
      await expectExpungeOutcome('Observation', linkedObs.id, linkedResourcesExist);
      await expectExpungeOutcome('Project', linkedProject.id, linkedResourcesExist);
      await expectExpungeOutcome('ClientApplication', linkedClient.id, linkedResourcesExist);
      await expectExpungeOutcome('ProjectMembership', linkedMembership.id, linkedResourcesExist);
    } else {
      expect(res).toHaveStatus(403);
    }
  });

  test('Project admin can expunge patient everything within own project', async () => {
    const { accessToken, repo } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      membership: { admin: true },
    });

    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    const obs = await repo.createResource<Observation>({
      resourceType: 'Observation',
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
    expect(res).toHaveStatus(202);

    const asyncJob = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
    // The job must complete cleanly: the Expunger iterates every resource type, and
    // must skip the ones a project admin cannot search rather than erroring out.
    expect(asyncJob.status).toBe('completed');

    await expectExpungeTombstone('Patient', patient.id);
    await expectExpungeTombstone('Observation', obs.id);
  });

  test('Project admin cannot expunge patient everything in another project', async () => {
    // Patient belongs to an unrelated project
    const { repo: otherRepo } = await createTestProject({ withRepo: true });
    const otherPatient = await otherRepo.createResource<Patient>({
      resourceType: 'Patient',
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
    expect(res).toHaveStatus(202);

    await waitForAsyncJob(res.headers['content-location'], app, accessToken);

    expect(await existsInDatabase('Patient', otherPatient.id)).toBe(true);
  });

  test('Expunger.expunge() expunges all resource types', async () => {
    const { project, client, membership, repo } = await createTestProject({
      withClient: true,
      withRepo: true,
      membership: { admin: true },
    });

    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });
    const patient2 = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Smith' }],
    });
    const patient3 = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Smith' }],
    });

    const obs = await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: LOINC, code: '12345-6' }] },
      subject: { reference: 'Patient/' + patient.id },
    });
    const auditEvent = await repo.createResource<AuditEvent>({
      resourceType: 'AuditEvent',
      type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest' },
      recorded: new Date().toISOString(),
      agent: [{ requestor: true, who: { reference: 'Patient/' + patient.id } }],
      source: { observer: { identifier: { value: 'test' } } },
    });

    expect(await existsInCache('Project', project.id)).toBe(true);
    expect(await existsInCache('ClientApplication', client.id)).toBe(true);
    expect(await existsInCache('ProjectMembership', membership.id)).toBe(true);
    expect(await existsInCache('Patient', patient.id)).toBe(true);
    expect(await existsInCache('Patient', patient2.id)).toBe(true);
    expect(await existsInCache('Patient', patient3.id)).toBe(true);
    expect(await existsInCache('Observation', obs.id)).toBe(true);

    //execute
    await new Expunger(repo, project.id, 2).expunge();

    //result

    await expectExpungeTombstone('Project', project.id);
    await expectExpungeTombstone('ClientApplication', client.id);
    await expectExpungeTombstone('ProjectMembership', membership.id);
    await expectExpungeTombstone('Patient', patient.id);
    await expectExpungeTombstone('Patient', patient2.id);
    await expectExpungeTombstone('Patient', patient3.id);
    await expectExpungeTombstone('Observation', obs.id);
    await expectExpungeTombstone('AuditEvent', auditEvent.id);

    expect(await existsInCache('Project', project.id)).toBe(false);
    expect(await existsInCache('ClientApplication', client.id)).toBe(false);
    expect(await existsInCache('ProjectMembership', membership.id)).toBe(false);
    expect(await existsInCache('Patient', patient.id)).toBe(false);
    expect(await existsInCache('Patient', patient2.id)).toBe(false);
    expect(await existsInCache('Patient', patient3.id)).toBe(false);
    expect(await existsInCache('Observation', obs.id)).toBe(false);
  });

  test('Expunger expunges AuditEvent and leaves a history tombstone', async () => {
    const { project, repo } = await createTestProject({ withRepo: true, membership: { admin: true } });
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });
    const auditEvent = await repo.createResource<AuditEvent>({
      resourceType: 'AuditEvent',
      type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest' },
      recorded: new Date().toISOString(),
      agent: [{ requestor: true, who: { reference: 'Patient/' + patient.id } }],
      source: { observer: { identifier: { value: 'test' } } },
    });

    await new Expunger(repo, project.id, 2).expunge();

    await expectExpungeTombstone('Patient', patient.id);
    await expectExpungeTombstone('AuditEvent', auditEvent.id);
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

async function expectExpungeTombstone(resourceType: string, id: string | undefined): Promise<void> {
  expect(await existsInDatabase(resourceType, id)).toBe(false);

  const rows = await new SelectQuery(resourceType + '_History')
    .column('content')
    .where('id', '=', id)
    .execute(getDatabasePool(DatabaseMode.READER));

  expect(rows).toHaveLength(1);
  const tombstone = JSON.parse(rows[0].content);
  expect(isExpungedHistoryVersion(tombstone)).toBe(true);
  expect(tombstone).toMatchObject({ resourceType, id });
  expect(tombstone.meta.deleted).toBeUndefined();
  expect(Object.keys(tombstone).sort()).toEqual(['id', 'meta', 'resourceType']);
}

async function expectExpungeOutcome(
  resourceType: string,
  id: string | undefined,
  stillPresent: boolean
): Promise<void> {
  if (stillPresent) {
    expect(await existsInDatabase(resourceType, id)).toBe(true);
  } else {
    await expectExpungeTombstone(resourceType, id);
  }
}
