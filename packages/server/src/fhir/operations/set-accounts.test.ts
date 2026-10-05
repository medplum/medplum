// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, getReferenceString, OperationOutcomeError, serverError } from '@medplum/core';
import type {
  AsyncJob,
  Bundle,
  Communication,
  DiagnosticReport,
  Login,
  Observation,
  Organization,
  Patient,
  Project,
  ProjectMembership,
  Resource,
  UserConfiguration,
} from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import express from 'express';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { ServerConfig } from '../../config/utils';
import { getAuthenticatedContext, runInAuthenticatedContext } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getCacheRedis } from '../../redis';
import { createTestProject, initTestAuth, waitForAsyncJob } from '../../test.setup';
import type { SetAccountsJobData } from '../../workers/set-accounts';
import { execSetAccountsJob, getSetAccountsQueue } from '../../workers/set-accounts';
import { CancelledError } from '../../workers/utils';
import { FhirRateLimiter } from '../fhirquota';
import { getProjectSystemRepo, Repository } from '../repo';
import { setAccountsHandler, setResourceAccounts } from './set-accounts';

const app = express();
let accessToken: string;
let login: WithId<Login>;
let membership: WithId<ProjectMembership>;
let project: WithId<Project>;
let observation: Observation;
let diagnosticReport: DiagnosticReport;
let patient: Patient;
let organization1: Organization;
let organization2: Organization;
let config: ServerConfig;
const updateSpies: ReturnType<typeof spyOnUpdateResource>[] = [];

describe('Patient Set Accounts Operation', () => {
  beforeEach(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    ({ accessToken, login, membership, project } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    }));

    // Create organization
    const orgRes = await request(app)
      .post('/fhir/R4/Organization')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Organization' });
    expect(orgRes).toHaveStatus(201);
    organization1 = orgRes.body as Organization;

    const orgRes2 = await request(app)
      .post('/fhir/R4/Organization')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Organization' });
    expect(orgRes2).toHaveStatus(201);
    organization2 = orgRes2.body as Organization;

    // Create patient
    const res1 = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      } satisfies Patient);
    expect(res1).toHaveStatus(201);
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
    expect(res2).toHaveStatus(201);
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
    expect(res3).toHaveStatus(201);
    diagnosticReport = res3.body as DiagnosticReport;
  });

  afterEach(async () => {
    for (const spy of updateSpies.splice(0)) {
      spy.mockRestore();
    }
    await shutdownApp();
  });

  test('Updates target patient and compartment resources', async () => {
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
          {
            name: 'propagate',
            valueBoolean: true,
          },
        ],
      });
    expect(res3).toHaveStatus(200);
    const result = res3.body;
    expect(result.parameter?.[0].name).toBe('resourcesUpdated');
    expect(result.parameter?.[0].valueInteger).toBe(3); // Observation and DiagnosticReport

    //check if the accounts are updated on the patient
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}`)
      .set('X-Medplum', 'extended')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4).toHaveStatus(200);
    const updatedPatient = res4.body as Patient;
    expect(updatedPatient.meta?.accounts).toBeDefined();
    expect(updatedPatient.meta?.accounts?.[0].reference).toBe(`Organization/${organization1.id}`);
    expect(updatedPatient.meta?.accounts?.[1].reference).toBe(`Organization/${organization2.id}`);

    // Check if accounts are updated on the observation
    const res5 = await request(app)
      .get(`/fhir/R4/Observation/${observation.id}`)
      .set('X-Medplum', 'extended')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5).toHaveStatus(200);
    const updatedObservation = res5.body as Observation;
    expect(updatedObservation.meta?.accounts).toBeDefined();
    expect(updatedObservation.meta?.accounts?.[0].reference).toBe(`Organization/${organization1.id}`);
    expect(updatedObservation.meta?.accounts?.[1].reference).toBe(`Organization/${organization2.id}`);

    // Check if accounts are updated on the diagnostic report
    const res6 = await request(app)
      .get(`/fhir/R4/DiagnosticReport/${diagnosticReport.id}`)
      .set('X-Medplum', 'extended')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6).toHaveStatus(200);
    const updatedDiagnosticReport = res6.body as DiagnosticReport;
    expect(updatedDiagnosticReport.meta?.accounts).toBeDefined();
    expect(updatedDiagnosticReport.meta?.accounts?.[0].reference).toBe(`Organization/${organization1.id}`);
    expect(updatedDiagnosticReport.meta?.accounts?.[1].reference).toBe(`Organization/${organization2.id}`);
  });

  test('Resources returned in $patient-everything but NOT in the patient compartment are not updated', async () => {
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
          {
            name: 'propagate',
            valueBoolean: true,
          },
        ],
      });
    expect(res7).toHaveStatus(200);
    const numberResourcesUpdated = res7.body.parameter?.[0].valueInteger;

    const res = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
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
    expect(res).toHaveStatus(404);
  });

  test('setAccountsHandler() called without an id', async () => {
    const res = await setAccountsHandler({
      params: { id: '' },
      method: 'POST',
      url: '/fhir/R4/Patient/$set-accounts',
      pathname: '/fhir/R4/Patient/$set-accounts',
      body: {},
      query: {},
    });
    expect(res[0].issue?.[0]?.details?.text).toBe('Must specify resource type and ID');
  });

  test('Preserves other meta fields on compartment resources', async () => {
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

    expect(res1).toHaveStatus(201);
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
          {
            name: 'propagate',
            valueBoolean: true,
          },
        ],
      });
    expect(res2).toHaveStatus(200);

    const res4 = await request(app)
      .get(`/fhir/R4/Communication/${communication.id}`)
      .set('X-Medplum', 'extended')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4).toHaveStatus(200);
    const updatedCommunication = res4.body as Communication;
    expect(updatedCommunication.meta?.accounts).toHaveLength(1);
    expect(updatedCommunication.meta?.security).toBeDefined();
  });

  test.each([
    [
      'meta.accounts',
      async () => {
        const res = await request(app)
          .post(`/fhir/R4/Observation/${observation.id}/$set-accounts`)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            resourceType: 'Parameters',
            parameter: [{ name: 'accounts', valueReference: createReference(organization2) }],
          });
        expect(res).toHaveStatus(200);
        expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 1 }); // Observation only
      },
    ],
    [
      'legacy meta.account',
      async () => {
        // Older data may have only the single meta.account field; the server normalizes on write, so
        // store it directly
        const systemRepo = await getProjectSystemRepo(project);
        const stored = await systemRepo.readResource<Observation>('Observation', observation.id as string);
        const legacy: Observation = {
          ...stored,
          meta: { ...stored.meta, account: createReference(organization2), accounts: undefined },
        };
        await getDatabasePool(DatabaseMode.WRITER).query('UPDATE "Observation" SET content = $1 WHERE id = $2', [
          JSON.stringify(legacy),
          observation.id,
        ]);
      },
    ],
  ])('Preserves existing accounts of compartment resources stored in %s', async (_storage, setExistingAccount) => {
    await setExistingAccount();

    const res = await setPatientAccounts([organization1], true);
    expect(res).toHaveStatus(200);
    expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });

    const updatedPatient = await readExtended<Patient>(`Patient/${patient.id}`);
    expect(updatedPatient.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);

    const obs = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(obs.meta?.accounts).toStrictEqual([
      { reference: getReferenceString(organization2) },
      { reference: getReferenceString(organization1) },
    ]);
    expect(obs.meta?.account).toStrictEqual({ reference: getReferenceString(organization2) });

    const report = await readExtended<DiagnosticReport>(`DiagnosticReport/${diagnosticReport.id}`);
    expect(report.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);
  });

  test('Non-admin user cannot set accounts', async () => {
    accessToken = await initTestAuth();
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
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
    expect(res).toHaveStatus(403);
  });

  test('Supports async response', async () => {
    const queue = getSetAccountsQueue() as any;
    queue.add.mockClear();

    const initRes = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Prefer', 'respond-async')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'accounts',
            valueReference: createReference(organization1),
          },
          {
            name: 'propagate',
            valueBoolean: true,
          },
        ],
      });
    expect(initRes).toHaveStatus(202);
    expect(initRes.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'SetAccountsJobData',
      expect.objectContaining<Partial<SetAccountsJobData>>({ resourceType: 'Patient', id: patient.id })
    );

    const contentLocation = new URL(initRes.headers['content-location']);
    const jobData = queue.add.mock.calls[0][1] as SetAccountsJobData;
    const job = { id: 1, data: jobData } as unknown as Job<SetAccountsJobData>;

    await runInAuthenticatedContext(
      { login, membership, project, userConfig: {} as unknown as UserConfiguration },
      undefined,
      undefined,
      { async: true },
      () => execSetAccountsJob(job)
    );

    await waitForAsyncJob(initRes.headers['content-location'], app, accessToken);
    const statusRes = await request(app)
      .get(contentLocation.pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(statusRes).toHaveStatus(200);
    expect((statusRes.body as AsyncJob).output?.parameter).toStrictEqual(
      expect.arrayContaining([{ name: 'resourcesUpdated', valueInteger: 3 }])
    );
  });

  test('Job aborts when AsyncJob.status is not continuable', async () => {
    const queue = getSetAccountsQueue() as any;
    queue.add.mockClear();

    // Start the operation
    const initRes = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Prefer', 'respond-async')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'accounts',
            valueReference: createReference(organization1),
          },
          {
            name: 'propagate',
            valueBoolean: true,
          },
        ],
      });
    expect(initRes).toHaveStatus(202);
    expect(initRes.headers['content-location']).toBeDefined();
    const jobUrlMatch = /job\/([^/]+)\/status/.exec(initRes.headers['content-location']);
    const asyncJobId = jobUrlMatch?.[1];

    // Cancel the job by updating AsyncJob.status
    const cancelRes = await request(app)
      .patch(`/fhir/R4/AsyncJob/${asyncJobId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send([{ op: 'replace', path: '/status', value: 'cancelled' }]);
    expect(cancelRes).toHaveStatus(200);

    // Manually push through BullMQ job
    expect(queue.add).toHaveBeenCalledWith(
      'SetAccountsJobData',
      expect.objectContaining<Partial<SetAccountsJobData>>({ resourceType: 'Patient', id: patient.id })
    );

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    queue.add.mockClear();

    await runInAuthenticatedContext(
      { login, membership, project, userConfig: {} as unknown as UserConfiguration },
      undefined,
      undefined,
      { async: true },
      () => execSetAccountsJob(job)
    );

    // Check that the job status doesn't update and no output is provided
    const contentLocation = new URL(initRes.headers['content-location']);
    await waitForAsyncJob(initRes.headers['content-location'], app, accessToken);

    const statusRes = await request(app)
      .get(contentLocation.pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(statusRes).toHaveStatus(200);
    const resBody = statusRes.body as AsyncJob;
    expect(resBody.status).toStrictEqual('cancelled');
    expect(resBody.output?.parameter).toBeUndefined();
  });

  test('Keeps target accounts when the job is cancelled during propagation', async () => {
    const asyncJob = await (
      await getProjectSystemRepo(project)
    ).createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'cancelled',
      requestTime: new Date().toISOString(),
      request: `Patient/${patient.id}/$set-accounts`,
    });

    await expect(
      runInAuthenticatedContext(
        { login, membership, project, userConfig: {} as unknown as UserConfiguration },
        undefined,
        undefined,
        { async: true },
        () =>
          setResourceAccounts(
            getAuthenticatedContext().repo,
            'Patient',
            patient.id as string,
            { accounts: [createReference(organization1)], propagate: true },
            asyncJob.id
          )
      )
    ).rejects.toThrow(CancelledError);

    const updatedPatient = await readExtended<Patient>(`Patient/${patient.id}`);
    expect(updatedPatient.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);
  });

  test('Removes account without extended header', async () => {
    const setTwo = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'accounts', valueReference: createReference(organization1) },
          { name: 'accounts', valueReference: createReference(organization2) },
          { name: 'propagate', valueBoolean: false },
        ],
      });
    expect(setTwo).toHaveStatus(200);

    const get1 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}`)
      .set('X-Medplum', 'extended')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(get1).toHaveStatus(200);
    expect(get1.body.meta?.accounts?.map((r: any) => r.reference)).toEqual(
      expect.arrayContaining([`Organization/${organization1.id}`, `Organization/${organization2.id}`])
    );

    const setOne = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'accounts', valueReference: createReference(organization2) },
          { name: 'propagate', valueBoolean: false },
        ],
      });
    expect(setOne).toHaveStatus(200);
    expect(setOne.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 1 });

    const get2 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}`)
      .set('X-Medplum', 'extended')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(get2).toHaveStatus(200);
    const acctRefs = (get2.body.meta?.accounts ?? []).map((r: any) => r.reference);
    expect(acctRefs).toEqual([`Organization/${organization2.id}`]);
  });

  test('Accounts applied to resource with no default profile', async () => {
    const { accessToken, repo } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      project: {
        defaultProfile: [
          { resourceType: 'Patient', profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
        ],
      },
      membership: { admin: true },
    });

    const organization = await repo.createResource<Organization>({ resourceType: 'Organization' });
    const orgRef = createReference(organization);

    const patientRes = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Patient',
        meta: { accounts: [orgRef] },
      } satisfies Patient);
    expect(patientRes).toHaveStatus(201);
    const patient = patientRes.body as Patient;
    const patientRef = createReference(patient);
    expect(patient.meta?.accounts).toStrictEqual([orgRef]);
    expect(patient.meta?.compartment).toContainEqual(orgRef);

    const reportRes = await request(app)
      .post(`/fhir/R4/DiagnosticReport`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'DiagnosticReport',
        status: 'final',
        code: { text: 'Lab report' },
        subject: patientRef,
      } satisfies DiagnosticReport);
    expect(reportRes).toHaveStatus(201);
    const diagnosticReport = reportRes.body as DiagnosticReport;
    expect(diagnosticReport.subject).toStrictEqual(patientRef);
    expect(diagnosticReport.meta?.compartment).toStrictEqual(expect.arrayContaining([orgRef, patientRef]));
  });

  test('Propagates empty accounts to target and compartment resources', async () => {
    const setTwo = await setPatientAccounts([organization1, organization2], true);
    expect(setTwo).toHaveStatus(200);

    const clear = await setPatientAccounts([], true);
    expect(clear).toHaveStatus(200);
    expect(clear.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });

    for (const ref of [
      `Patient/${patient.id}`,
      `Observation/${observation.id}`,
      `DiagnosticReport/${diagnosticReport.id}`,
    ]) {
      const resource = await readExtended(ref);
      expect(resource.meta?.accounts ?? []).toHaveLength(0);
      expect(resource.meta?.account).toBeUndefined();
    }
  });

  test('Retries compartment update when the resource is modified concurrently', async () => {
    const concurrentRepo = await getProjectSystemRepo(project);
    let observationUpdates = 0;
    spyOnUpdateResource(async (resource) => {
      if (resource.resourceType === 'Observation' && ++observationUpdates === 1) {
        // Commit a write from another connection after the operation's transaction read the
        // Observation, but before it writes
        const current = await concurrentRepo.readResource<Observation>('Observation', resource.id as string);
        await concurrentRepo.updateResource<Observation>({
          ...current,
          meta: { ...current.meta, accounts: [createReference(organization2)] },
        });
      }
    });

    const res = await setPatientAccounts([organization1], true);
    expect(res).toHaveStatus(200);
    expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });
    // Operation's write, the concurrent write, and the operation's retried write
    expect(observationUpdates).toBe(3);

    // Concurrently added account is preserved, and the propagated account is added
    const obs = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(obs.meta?.accounts).toStrictEqual([
      { reference: getReferenceString(organization2) },
      { reference: getReferenceString(organization1) },
    ]);
  });

  test('Skips compartment resource deleted after the compartment search', async () => {
    const concurrentRepo = await getProjectSystemRepo(project);
    const originalRead = Repository.prototype.readResource;
    let deleted = false;
    const readSpy = vi.spyOn(Repository.prototype, 'readResource').mockImplementation(async function (
      this: Repository,
      ...args: Parameters<typeof originalRead>
    ) {
      const [resourceType, id] = args;
      if (resourceType === 'Observation' && !deleted) {
        deleted = true;
        await concurrentRepo.deleteResource('Observation', id);
      }
      return originalRead.apply(this, args);
    });

    try {
      const res = await setPatientAccounts([organization1], true);
      expect(res).toHaveStatus(200);
      expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 2 });
    } finally {
      readSpy.mockRestore();
    }
    expect(deleted).toBe(true);

    const obsRes = await request(app)
      .get(`/fhir/R4/Observation/${observation.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(obsRes).toHaveStatus(410);

    const report = await readExtended<DiagnosticReport>(`DiagnosticReport/${diagnosticReport.id}`);
    expect(report.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);
  });

  test('Reverts target accounts when propagation fails, so the operation can be re-run', async () => {
    const initial = await setPatientAccounts([organization1], true);
    expect(initial).toHaveStatus(200);

    const updateSpy = spyOnUpdateResource(async (resource) => {
      if (resource.resourceType === 'DiagnosticReport') {
        throw new OperationOutcomeError(serverError(new Error('Simulated failure')));
      }
    });

    const failed = await setPatientAccounts([organization2], true);
    expect(failed).toHaveStatus(500);
    updateSpy.mockRestore();

    const reverted = await readExtended<Patient>(`Patient/${patient.id}`);
    expect(reverted.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);

    // Re-running finishes both the addition and the removal on every compartment resource
    const rerun = await setPatientAccounts([organization2], true);
    expect(rerun).toHaveStatus(200);
    expect(rerun.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });
    for (const ref of [
      `Patient/${patient.id}`,
      `Observation/${observation.id}`,
      `DiagnosticReport/${diagnosticReport.id}`,
    ]) {
      const resource = await readExtended(ref);
      expect(resource.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization2) }]);
    }
  });

  test('Does not revert target accounts that were rewritten after the operation wrote them', async () => {
    const initial = await setPatientAccounts([organization1], true);
    expect(initial).toHaveStatus(200);

    const concurrentRepo = await getProjectSystemRepo(project);
    spyOnUpdateResource(async (resource, originalUpdate) => {
      if (resource.resourceType === 'DiagnosticReport') {
        // Another writer changes the Patient's accounts and then sets them back to the value this
        // operation wrote, so the accounts match but the version does not
        for (const org of [organization1, organization2]) {
          const current = await concurrentRepo.readResource<Patient>('Patient', patient.id as string);
          await originalUpdate.call(concurrentRepo, {
            ...current,
            meta: { ...current.meta, accounts: [createReference(org)], account: createReference(org) },
          });
        }
        throw new OperationOutcomeError(serverError(new Error('Simulated failure')));
      }
    });

    const failed = await setPatientAccounts([organization2], true);
    expect(failed).toHaveStatus(500);

    const current = await readExtended<Patient>(`Patient/${patient.id}`);
    expect(current.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization2) }]);
  });

  test('Charges one write for the target when its transaction retries', async () => {
    const concurrentRepo = await getProjectSystemRepo(project);
    let patientUpdates = 0;
    spyOnUpdateResource(async (resource, originalUpdate) => {
      if (resource.resourceType === 'Patient' && ++patientUpdates === 1) {
        // Commit a write from another connection after the operation's transaction read the Patient,
        // forcing a serialization failure and a retry
        const current = await concurrentRepo.readResource<Patient>('Patient', resource.id as string);
        await originalUpdate.call(concurrentRepo, { ...current, gender: 'female' });
      }
    });
    const recordWriteSpy = vi.spyOn(FhirRateLimiter.prototype, 'recordWrite');

    try {
      const res = await setPatientAccounts([organization1], false);
      expect(res).toHaveStatus(200);
      // Operation's write, then its retried write
      expect(patientUpdates).toBe(2);
      expect(recordWriteSpy).toHaveBeenCalledTimes(1);
    } finally {
      recordWriteSpy.mockRestore();
    }

    const updated = await readExtended<Patient>(`Patient/${patient.id}`);
    expect(updated.gender).toBe('female');
    expect(updated.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);
  });

  test('Re-running only writes compartment resources that are missing the target accounts', async () => {
    const initial = await setPatientAccounts([organization1], true);
    expect(initial).toHaveStatus(200);

    // Remove the account from the Observation only
    const systemRepo = await getProjectSystemRepo(project);
    const current = await systemRepo.readResource<Observation>('Observation', observation.id as string);
    await systemRepo.updateResource<Observation>({
      ...current,
      meta: { ...current.meta, accounts: undefined, account: undefined },
    });
    const stripped = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(stripped.meta?.accounts).toBeUndefined();

    const transactionSpy = vi.spyOn(Repository.prototype, 'withTransaction');
    const recordWriteSpy = vi.spyOn(FhirRateLimiter.prototype, 'recordWrite');
    const compartmentTransactions = (): number =>
      transactionSpy.mock.calls.filter(([, options]) => options.source === 'setAccounts.compartment').length;
    try {
      const repair = await setPatientAccounts([organization1], true);
      expect(repair).toHaveStatus(200);
      expect(repair.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });
      // Only the Observation needed a write, in addition to the target
      expect(compartmentTransactions()).toBe(1);
      expect(recordWriteSpy).toHaveBeenCalledTimes(2);

      const obs = await readExtended<Observation>(`Observation/${observation.id}`);
      expect(obs.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);

      // With every compartment resource up to date, only the target is written
      transactionSpy.mockClear();
      recordWriteSpy.mockClear();
      const noop = await setPatientAccounts([organization1], true);
      expect(noop).toHaveStatus(200);
      expect(noop.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });
      expect(compartmentTransactions()).toBe(0);
      expect(recordWriteSpy).toHaveBeenCalledTimes(1);
    } finally {
      transactionSpy.mockRestore();
      recordWriteSpy.mockRestore();
    }
  });

  test('Rejects a run while another run on the same target is in progress', async () => {
    let started = false;
    let concurrent: request.Response | undefined;
    const updateSpy = spyOnUpdateResource(async (resource) => {
      if (resource.resourceType === 'DiagnosticReport' && !started) {
        started = true;
        concurrent = await setPatientAccounts([organization2], true);
      }
    });

    const first = await setPatientAccounts([organization1], true);
    expect(first).toHaveStatus(200);
    updateSpy.mockRestore();
    expect(concurrent).toHaveStatus(409);

    // The lock is released once the first run finishes
    const next = await setPatientAccounts([organization2], true);
    expect(next).toHaveStatus(200);
  });

  test('Stops propagating when the run loses its lock on the target', async () => {
    let lockLost = false;
    spyOnUpdateResource(async (resource) => {
      if (resource.resourceType === 'Patient' && !lockLost) {
        // Another run takes over the expired lock, and enough time passes that this run renews it
        lockLost = true;
        await getCacheRedis().set(`medplum:set-accounts:Patient/${patient.id}`, 'other-run');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 10 * 60 * 1000);
      }
    }, 'after');

    try {
      const res = await setPatientAccounts([organization1], true);
      expect(res).toHaveStatus(409);
    } finally {
      vi.useRealTimers();
    }

    // The other run's lock is left in place
    expect(await getCacheRedis().get(`medplum:set-accounts:Patient/${patient.id}`)).toBe('other-run');
    await getCacheRedis().del(`medplum:set-accounts:Patient/${patient.id}`);

    const obs = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(obs.meta?.accounts).toBeUndefined();
  });
});

async function setPatientAccounts(accounts: Organization[], propagate: boolean): Promise<request.Response> {
  return request(app)
    .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({
      resourceType: 'Parameters',
      parameter: [
        ...accounts.map((a) => ({ name: 'accounts', valueReference: createReference(a) })),
        { name: 'propagate', valueBoolean: propagate },
      ],
    });
}

/**
 * Spies on `Repository.updateResource`, running `hook` around each call (before it by default). The spy is
 * restored after the test, so assertions on its calls must run within the test body.
 * @param hook - Called with the resource being updated and the unspied `updateResource`, for writes that
 *   should bypass the spy.
 * @param timing - Whether `hook` runs before or after the real update.
 * @returns The spy.
 */
function spyOnUpdateResource(
  hook: (resource: Resource, originalUpdate: Repository['updateResource']) => Promise<void>,
  timing: 'before' | 'after' = 'before'
): MockInstance<Repository['updateResource']> {
  const originalUpdate = Repository.prototype.updateResource;
  const spy = vi.spyOn(Repository.prototype, 'updateResource').mockImplementation(async function (
    this: Repository,
    ...args: Parameters<typeof originalUpdate>
  ) {
    if (timing === 'before') {
      await hook(args[0], originalUpdate);
    }
    const result = await originalUpdate.apply(this, args);
    if (timing === 'after') {
      await hook(args[0], originalUpdate);
    }
    return result;
  });
  updateSpies.push(spy);
  return spy;
}

async function readExtended<T extends Resource = Resource>(ref: string): Promise<T> {
  const res = await request(app)
    .get(`/fhir/R4/${ref}`)
    .set('X-Medplum', 'extended')
    .set('Authorization', 'Bearer ' + accessToken);
  expect(res).toHaveStatus(200);
  return res.body as T;
}
