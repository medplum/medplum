// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import type {
  AsyncJob,
  Communication,
  DiagnosticReport,
  Parameters as FhirParameters,
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
let observation: WithId<Observation>;
let diagnosticReport: WithId<DiagnosticReport>;
let patient: WithId<Patient>;
let organization1: WithId<Organization>;
let organization2: WithId<Organization>;
let config: ServerConfig;

describe('Patient Set Accounts Operation', () => {
  beforeEach(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    ({ accessToken, login, membership, project } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    }));

    organization1 = await createExtended<Organization>({ resourceType: 'Organization' });
    organization2 = await createExtended<Organization>({ resourceType: 'Organization' });
    patient = await createExtended<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });
    observation = await createExtended<Observation>({
      resourceType: 'Observation',
      // A security label, to check that propagation preserves the other meta fields
      meta: { security: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality', code: 'N' }] },
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: 'test-code' }] },
      subject: createReference(patient),
    });
    diagnosticReport = await createExtended<DiagnosticReport>({
      resourceType: 'DiagnosticReport',
      subject: createReference(patient),
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: 'test-code' }] },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await shutdownApp();
  });

  test('Sets and clears accounts on the target and compartment resources', async () => {
    const org1 = { reference: getReferenceString(organization1) };
    const org2 = { reference: getReferenceString(organization2) };
    const targets = [patient, observation, diagnosticReport].map((r) => getReferenceString(r));
    expect(observation.meta?.security).toBeDefined();

    const set = await setPatientAccounts([organization1, organization2], true);
    expect(set).toHaveStatus(200);
    expect(set.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 }); // Patient, Observation, DiagnosticReport
    for (const ref of targets) {
      const resource = await readExtended(ref);
      expect(resource.meta?.accounts).toStrictEqual([org1, org2]);
      expect(resource.meta?.account).toStrictEqual(org1);
    }
    const labelled = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(labelled.meta?.security).toStrictEqual(observation.meta?.security);

    const clear = await setPatientAccounts([], true);
    expect(clear).toHaveStatus(200);
    expect(clear.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });
    for (const ref of targets) {
      const resource = await readExtended(ref);
      expect(resource.meta?.accounts ?? []).toHaveLength(0);
      expect(resource.meta?.account).toBeUndefined();
    }
    const stillLabelled = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(stillLabelled.meta?.security).toStrictEqual(observation.meta?.security);
  });

  test('Replaces target accounts without touching the compartment when propagate is false', async () => {
    expect(await setPatientAccounts([organization1, organization2], false)).toHaveStatus(200);

    const replace = await setPatientAccounts([organization2], false);
    expect(replace).toHaveStatus(200);
    expect(replace.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 1 });

    const updatedPatient = await readExtended<Patient>(`Patient/${patient.id}`);
    expect(updatedPatient.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization2) }]);
    const untouched = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(untouched.meta?.accounts).toBeUndefined();
  });

  test('Patient not found', async () => {
    const res = await setPatientAccounts([organization1], false, { id: 'not-found' });
    expect(res).toHaveStatus(404);
  });

  test('Non-admin user cannot set accounts', async () => {
    const res = await setPatientAccounts([organization1], false, { token: await initTestAuth() });
    expect(res).toHaveStatus(403);
  });

  test.each([
    ['missing id', { id: '', resourceType: 'Patient' }, 'Must specify resource type and ID'],
    ['invalid resource type', { id: 'abc', resourceType: 'NotAResourceType' }, 'Invalid resource type'],
  ])('setAccountsHandler() rejects %s', async (_name, params, message) => {
    const res = await setAccountsHandler({
      params,
      method: 'POST',
      url: '/fhir/R4/Patient/$set-accounts',
      pathname: '/fhir/R4/Patient/$set-accounts',
      body: {},
      query: {},
    });
    expect(res[0].issue?.[0]?.details?.text).toBe(message);
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
        const stored = await systemRepo.readResource<Observation>('Observation', observation.id);
        const legacy: Observation = {
          ...stored,
          meta: { ...stored.meta, account: createReference(organization2), accounts: undefined },
        };
        await getDatabasePool(DatabaseMode.WRITER, systemRepo.shardId).query(
          'UPDATE "Observation" SET content = $1 WHERE id = $2',
          [JSON.stringify(legacy), observation.id]
        );
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

  test('Preserves accounts from other patients on resources in multiple patient compartments', async () => {
    const org1 = { reference: getReferenceString(organization1) };
    const org2 = { reference: getReferenceString(organization2) };

    const bob = await createExtended<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Jones' }],
      meta: { accounts: [org2] },
    });
    expect(bob.meta?.accounts).toStrictEqual([org2]);
    const patients = [{ reference: getReferenceString(patient) }, { reference: getReferenceString(bob) }];

    // In Alice's compartment via subject, and Bob's via recipient
    const communication = await createExtended<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      subject: createReference(patient),
      recipient: [createReference(bob)],
    });
    expect(communication.meta?.accounts).toStrictEqual([org2]);

    // Alice gets one account of her own, and one she shares with Bob
    const add = await setPatientAccounts([organization1, organization2], true);
    expect(add).toHaveStatus(200);
    expect(add.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 4 });

    const added = await readExtended<Communication>(`Communication/${communication.id}`);
    expect(added.meta?.accounts).toStrictEqual([org2, org1]);
    expect(added.meta?.compartment).toStrictEqual(expect.arrayContaining([org1, org2, ...patients]));

    // Removing the account only Alice has drops it. Bob is read once, to check whether he keeps it.
    const readSpy = vi.spyOn(Repository.prototype, 'readReferences');
    const bobReads = (): number =>
      readSpy.mock.calls.filter(([refs]) => refs.some((r) => r.reference === patients[1].reference)).length;
    const removeOwn = await setPatientAccounts([organization2], true);
    expect(removeOwn).toHaveStatus(200);
    expect(bobReads()).toBe(1);

    const ownRemoved = await readExtended<Communication>(`Communication/${communication.id}`);
    expect(ownRemoved.meta?.accounts).toStrictEqual([org2]);
    expect(ownRemoved.meta?.compartment).toStrictEqual(expect.arrayContaining([org2, ...patients]));
    expect(ownRemoved.meta?.compartment).not.toContainEqual(org1);

    // Removing the account Alice shares with Bob keeps it, since Bob still has it. The Communication
    // already has the right accounts, so it is counted but not written.
    readSpy.mockClear();
    const removeShared = await setPatientAccounts([], true);
    expect(removeShared).toHaveStatus(200);
    expect(removeShared.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 4 });
    expect(bobReads()).toBe(1);

    const sharedRemoved = await readExtended<Communication>(`Communication/${communication.id}`);
    expect(sharedRemoved.meta?.versionId).toBe(ownRemoved.meta?.versionId);
    expect(sharedRemoved.meta?.accounts).toStrictEqual([org2]);
    expect(sharedRemoved.meta?.compartment).toStrictEqual(expect.arrayContaining([org2, ...patients]));

    // Bob is not in the target's compartment, so is left untouched
    const bobAfter = await readExtended<Patient>(`Patient/${bob.id}`);
    expect(bobAfter.meta?.versionId).toBe(bob.meta?.versionId);
    expect(bobAfter.meta?.accounts).toStrictEqual([org2]);
  });

  test('Re-running only writes compartment resources that are missing the target accounts', async () => {
    const initial = await setPatientAccounts([organization1], true);
    expect(initial).toHaveStatus(200);

    // Remove the account from the Observation only
    const systemRepo = await getProjectSystemRepo(project);
    const current = await systemRepo.readResource<Observation>('Observation', observation.id);
    await systemRepo.updateResource<Observation>({
      ...current,
      meta: { ...current.meta, accounts: undefined, account: undefined },
    });
    const stripped = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(stripped.meta?.accounts).toBeUndefined();

    const transactionSpy = vi.spyOn(Repository.prototype, 'withTransaction');
    const recordWriteSpy = vi.spyOn(FhirRateLimiter.prototype, 'recordWrite');

    const repair = await setPatientAccounts([organization1], true);
    expect(repair).toHaveStatus(200);
    expect(repair.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });
    // Only the Observation needed a write, in addition to the target
    expect(compartmentWrites(transactionSpy)).toStrictEqual(['Observation']);
    expect(recordWriteSpy).toHaveBeenCalledTimes(2);

    const obs = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(obs.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);

    // With every compartment resource up to date, only the target is written
    transactionSpy.mockClear();
    recordWriteSpy.mockClear();
    const noop = await setPatientAccounts([organization1], true);
    expect(noop).toHaveStatus(200);
    expect(noop.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });
    expect(compartmentWrites(transactionSpy)).toHaveLength(0);
    expect(recordWriteSpy).toHaveBeenCalledTimes(1);
  });

  test('Counts and writes each compartment resource once when its write moves it to a later page', async () => {
    for (let i = 0; i < 25; i++) {
      await createExtended<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'paged' },
        subject: createReference(patient),
      });
    }

    useSmallCompartmentPages();
    const transactionSpy = vi.spyOn(Repository.prototype, 'withTransaction');

    const res = await setPatientAccounts([organization1], true);
    expect(res).toHaveStatus(200);
    expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 28 });
    expect(compartmentWrites(transactionSpy)).toHaveLength(27);
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

    const res = await setPatientAccounts([organization1], false);
    expect(res).toHaveStatus(200);
    // Operation's write, then its retried write
    expect(patientUpdates).toBe(2);
    expect(recordWriteSpy).toHaveBeenCalledTimes(1);

    const updated = await readExtended<Patient>(`Patient/${patient.id}`);
    expect(updated.gender).toBe('female');
    expect(updated.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);
  });

  test('Skips compartment resource deleted after the compartment search', async () => {
    const concurrentRepo = await getProjectSystemRepo(project);
    let deleted = false;
    spyOnReadResource(async (resourceType, id) => {
      if (resourceType === 'Observation' && !deleted) {
        deleted = true;
        await concurrentRepo.deleteResource('Observation', id);
      }
    });

    const res = await setPatientAccounts([organization1], true);
    expect(res).toHaveStatus(200);
    expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 2 });
    expect(deleted).toBe(true);

    const obsRes = await request(app)
      .get(`/fhir/R4/Observation/${observation.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(obsRes).toHaveStatus(410);

    const report = await readExtended<DiagnosticReport>(`DiagnosticReport/${diagnosticReport.id}`);
    expect(report.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);
  });

  test('Skips compartment resource moved to another patient after the compartment search', async () => {
    const bob = await createExtended<Patient>({ resourceType: 'Patient' });
    const concurrentRepo = await getProjectSystemRepo(project);
    let moved = false;
    spyOnReadResource(async (resourceType, id) => {
      if (resourceType === 'Observation' && !moved) {
        moved = true;
        const current = await concurrentRepo.readResource<Observation>('Observation', id);
        await concurrentRepo.updateResource<Observation>({ ...current, subject: createReference(bob) });
      }
    });

    const res = await setPatientAccounts([organization1], true);
    expect(res).toHaveStatus(200);
    expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 2 });
    expect(moved).toBe(true);

    const obs = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(obs.subject).toStrictEqual(createReference(bob));
    expect(obs.meta?.accounts).toBeUndefined();
  });

  test('Rejects a run while another run on the same Patient is in progress, then releases the lock', async () => {
    let started = false;
    let concurrent: request.Response | undefined;
    spyOnUpdateResource(async (resource) => {
      if (resource.resourceType === 'DiagnosticReport' && !started) {
        started = true;
        // Without propagation, since every run on a Patient takes the lock
        concurrent = await setPatientAccounts([organization2], false);
      }
    });

    const first = await setPatientAccounts([organization1], true);
    expect(first).toHaveStatus(200);
    expect(started).toBe(true);
    expect(concurrent).toHaveStatus(409);

    // The rejected run did not write
    const unchanged = await readExtended<Patient>(`Patient/${patient.id}`);
    expect(unchanged.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);

    // The lock is released once the first run finishes
    const next = await setPatientAccounts([organization2], true);
    expect(next).toHaveStatus(200);
  });

  test('A retried job resumes despite the lock left behind by its crashed attempt', async () => {
    const asyncJob = await createAsyncJob('accepted');
    const lockKey = `medplum:set-accounts:Patient/${patient.id}`;
    await getCacheRedis().set(lockKey, `${asyncJob.id}:crashed-attempt`, 'PX', 60_000);

    const result = await setPatientAccountsAsJob(asyncJob.id);
    expect(result?.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 3 });
    expect(await getCacheRedis().get(lockKey)).toBeNull();
  });

  test('An earlier attempt of a job stops within a page once a retry takes over its lock', async () => {
    for (let i = 0; i < 25; i++) {
      await createExtended<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'paged' },
        subject: createReference(patient),
      });
    }
    useSmallCompartmentPages();
    const asyncJob = await createAsyncJob('accepted');
    const lockKey = `medplum:set-accounts:Patient/${patient.id}`;
    let retried = false;
    spyOnUpdateResource(async (resource) => {
      if (resource.resourceType !== 'Patient' && !retried) {
        // A retry of the same job takes over, e.g. after BullMQ wrongly marks this attempt as stalled
        retried = true;
        await getCacheRedis().set(lockKey, `${asyncJob.id}:retry`, 'PX', 60_000);
      }
    });
    const transactionSpy = vi.spyOn(Repository.prototype, 'withTransaction');

    await expect(setPatientAccountsAsJob(asyncJob.id)).rejects.toThrow('lost its lock');
    expect(compartmentWrites(transactionSpy).length).toBeLessThan(27);

    // The earlier attempt leaves the retry's lock in place
    expect(await getCacheRedis().get(lockKey)).toBe(`${asyncJob.id}:retry`);
    await getCacheRedis().del(lockKey);
  });

  test('Stops propagating when the run loses its lock on the target', async () => {
    const lockKey = `medplum:set-accounts:Patient/${patient.id}`;
    let lockLost = false;
    spyOnUpdateResource(async (resource) => {
      if (resource.resourceType === 'Patient' && !lockLost) {
        // Another run takes over the expired lock, and enough time passes that this run renews it
        lockLost = true;
        await getCacheRedis().set(lockKey, 'other-run');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 10 * 60 * 1000);
      }
    }, 'after');

    const res = await setPatientAccounts([organization1], true);
    vi.useRealTimers();
    expect(res).toHaveStatus(409);

    // The other run's lock is left in place
    expect(await getCacheRedis().get(lockKey)).toBe('other-run');
    await getCacheRedis().del(lockKey);

    const obs = await readExtended<Observation>(`Observation/${observation.id}`);
    expect(obs.meta?.accounts).toBeUndefined();
  });

  test('Checks that the caller can read the target before taking its lock', async () => {
    const lockKey = `medplum:set-accounts:Patient/${patient.id}`;
    const { accessToken: otherAdminToken } = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
    });
    const evalSpy = vi.spyOn(getCacheRedis(), 'eval');

    const res = await setPatientAccounts([organization1], true, { token: otherAdminToken });
    expect(res).toHaveStatus(404);
    expect(evalSpy.mock.calls.some((call) => call.includes(lockKey))).toBe(false);
  });

  test('Does not lock non-Patient targets, which have no compartment to propagate to', async () => {
    const lockKey = `medplum:set-accounts:Organization/${organization1.id}`;
    await getCacheRedis().set(lockKey, 'other-run', 'PX', 60_000);
    try {
      const res = await request(app)
        .post(`/fhir/R4/Organization/${organization1.id}/$set-accounts`)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'accounts', valueReference: createReference(organization2) },
            { name: 'propagate', valueBoolean: true },
          ],
        });
      expect(res).toHaveStatus(200);
      expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 1 });
    } finally {
      await getCacheRedis().del(lockKey);
    }
  });

  test('Supports async response', async () => {
    const { contentLocation, job } = await requestAsyncSetAccounts();
    await runInJobContext(() => execSetAccountsJob(job));

    await waitForAsyncJob(contentLocation, app, accessToken);
    const statusRes = await request(app)
      .get(new URL(contentLocation).pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(statusRes).toHaveStatus(200);
    expect((statusRes.body as AsyncJob).output?.parameter).toStrictEqual(
      expect.arrayContaining([{ name: 'resourcesUpdated', valueInteger: 3 }])
    );
  });

  test('Job aborts when AsyncJob.status is not continuable', async () => {
    const { contentLocation, job } = await requestAsyncSetAccounts();

    // Cancel the job by updating AsyncJob.status
    const asyncJobId = /job\/([^/]+)\/status/.exec(contentLocation)?.[1];
    const cancelRes = await request(app)
      .patch(`/fhir/R4/AsyncJob/${asyncJobId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send([{ op: 'replace', path: '/status', value: 'cancelled' }]);
    expect(cancelRes).toHaveStatus(200);

    await runInJobContext(() => execSetAccountsJob(job));

    // Check that the job status doesn't update and no output is provided
    await waitForAsyncJob(contentLocation, app, accessToken);
    const statusRes = await request(app)
      .get(new URL(contentLocation).pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(statusRes).toHaveStatus(200);
    const resBody = statusRes.body as AsyncJob;
    expect(resBody.status).toStrictEqual('cancelled');
    expect(resBody.output?.parameter).toBeUndefined();
  });

  test('Keeps target accounts when the job is cancelled during propagation', async () => {
    const asyncJob = await createAsyncJob('cancelled');

    await expect(setPatientAccountsAsJob(asyncJob.id)).rejects.toThrow(CancelledError);

    const updatedPatient = await readExtended<Patient>(`Patient/${patient.id}`);
    expect(updatedPatient.meta?.accounts).toStrictEqual([{ reference: getReferenceString(organization1) }]);
  });

  test('Respects access policy of the user when propagating', async () => {
    const { accessToken, project, repo } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      membership: { admin: true },
      accessPolicy: {
        resource: [
          { resourceType: 'Patient' },
          { resourceType: 'Observation', readonly: true },
          { resourceType: 'DiagnosticReport', hiddenFields: ['conclusion'] },
        ],
      },
    });
    const systemRepo = repo.getSystemRepo();
    const meta = { project: project.id };
    const orgRef = createReference(organization1);

    const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient', meta });
    const observation = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      meta,
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
    });
    const diagnosticReport = await systemRepo.createResource<DiagnosticReport>({
      resourceType: 'DiagnosticReport',
      meta,
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
      conclusion: 'hidden from the user',
    });

    const res = await setPatientAccounts([organization1], true, { id: patient.id, token: accessToken });
    expect(res).toHaveStatus(200);
    expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 2 });

    // Read-only resources are not updated
    const unchangedObservation = await systemRepo.readResource<Observation>('Observation', observation.id);
    expect(unchangedObservation.meta?.versionId).toStrictEqual(observation.meta?.versionId);
    expect(unchangedObservation.meta?.accounts).toBeUndefined();

    // Hidden fields of updated resources are preserved
    const updatedReport = await systemRepo.readResource<DiagnosticReport>('DiagnosticReport', diagnosticReport.id);
    expect(updatedReport.meta?.accounts).toStrictEqual([orgRef]);
    expect(updatedReport.conclusion).toStrictEqual('hidden from the user');
  });

  test('Counts up-to-date compartment resources the user can update by a field hidden from them', async () => {
    const { accessToken, project, repo } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      membership: { admin: true },
      accessPolicy: {
        resource: [
          { resourceType: 'Patient' },
          { resourceType: 'DiagnosticReport', criteria: 'DiagnosticReport?status=final', hiddenFields: ['status'] },
        ],
      },
    });
    const systemRepo = repo.getSystemRepo();
    const meta = { project: project.id };
    const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient', meta });
    await systemRepo.createResource<DiagnosticReport>({
      resourceType: 'DiagnosticReport',
      meta,
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
    });

    const first = await setPatientAccounts([organization1], true, { id: patient.id, token: accessToken });
    expect(first.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 2 });
    // The DiagnosticReport is already up to date, and still counts as updatable
    const rerun = await setPatientAccounts([organization1], true, { id: patient.id, token: accessToken });
    expect(rerun.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 2 });
  });

  test('Does not propagate to resources in linked Projects', async () => {
    const { project: linkedProject, repo: linkedRepo } = await createTestProject({ withRepo: true });
    const { accessToken, repo } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      project: { link: [{ project: createReference(linkedProject) }] },
      membership: { admin: true },
    });

    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const linkedObservation = await linkedRepo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
    });
    expect(linkedObservation.meta?.compartment).toContainEqual({ reference: getReferenceString(patient) });
    await expect(repo.readResource('Observation', linkedObservation.id)).resolves.toBeDefined();

    const res = await setPatientAccounts([organization1], true, { id: patient.id, token: accessToken });
    expect(res).toHaveStatus(200);
    expect(res.body.parameter?.[0]).toMatchObject({ name: 'resourcesUpdated', valueInteger: 1 });

    const unchangedObservation = await linkedRepo.readResource<Observation>('Observation', linkedObservation.id);
    expect(unchangedObservation.meta?.versionId).toStrictEqual(linkedObservation.meta?.versionId);
    expect(unchangedObservation.meta?.accounts).toBeUndefined();
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
});

/**
 * Runs `$set-accounts` on a Patient.
 * @param accounts - The accounts to set.
 * @param propagate - Whether to propagate to the Patient's compartment.
 * @param options - Overrides for the caller and target.
 * @param options.id - The ID of the target Patient. Defaults to the test Patient.
 * @param options.token - The access token of the caller. Defaults to the test project admin.
 * @returns The HTTP response.
 */
async function setPatientAccounts(
  accounts: Organization[],
  propagate: boolean,
  options: { id?: string; token?: string } = {}
): Promise<request.Response> {
  return request(app)
    .post(`/fhir/R4/Patient/${options.id ?? patient.id}/$set-accounts`)
    .set('Authorization', 'Bearer ' + (options.token ?? accessToken))
    .send({
      resourceType: 'Parameters',
      parameter: [
        ...accounts.map((a) => ({ name: 'accounts', valueReference: createReference(a) })),
        { name: 'propagate', valueBoolean: propagate },
      ],
    });
}

/**
 * Starts an async `$set-accounts` run on the Patient, leaving its job on the (mock) queue.
 * @returns The Content-Location of the AsyncJob, and the queued job to run.
 */
async function requestAsyncSetAccounts(): Promise<{ contentLocation: string; job: Job<SetAccountsJobData> }> {
  const queue = getSetAccountsQueue();
  if (!queue) {
    throw new Error('SetAccounts queue not available');
  }
  const addJob = vi.mocked(queue.add);
  addJob.mockClear();

  const res = await request(app)
    .post(`/fhir/R4/Patient/${patient.id}/$set-accounts`)
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', ContentType.FHIR_JSON)
    .set('Prefer', 'respond-async')
    .send({
      resourceType: 'Parameters',
      parameter: [
        { name: 'accounts', valueReference: createReference(organization1) },
        { name: 'propagate', valueBoolean: true },
      ],
    });
  expect(res).toHaveStatus(202);
  expect(addJob).toHaveBeenCalledWith(
    'SetAccountsJobData',
    expect.objectContaining<Partial<SetAccountsJobData>>({ resourceType: 'Patient', id: patient.id })
  );
  return {
    contentLocation: res.headers['content-location'],
    // The mock queue does not run jobs, so wrap the queued data in a minimal Job
    job: { id: 1, data: addJob.mock.calls[0][1] } as unknown as Job<SetAccountsJobData>,
  };
}

async function runInJobContext<T>(fn: () => Promise<T>): Promise<T> {
  return runInAuthenticatedContext(
    { login, membership, project, userConfig: {} as unknown as UserConfiguration },
    undefined,
    undefined,
    { async: true },
    fn
  );
}

async function createAsyncJob(status: AsyncJob['status']): Promise<WithId<AsyncJob>> {
  const systemRepo = await getProjectSystemRepo(project);
  return systemRepo.createResource<AsyncJob>({
    resourceType: 'AsyncJob',
    status,
    requestTime: new Date().toISOString(),
    request: `Patient/${patient.id}/$set-accounts`,
  });
}

function setPatientAccountsAsJob(asyncJobId: string): Promise<FhirParameters | undefined> {
  return runInJobContext(() =>
    setResourceAccounts(
      getAuthenticatedContext().repo,
      'Patient',
      patient.id,
      { accounts: [createReference(organization1)], propagate: true },
      asyncJobId
    )
  );
}

/**
 * Shrinks compartment search pages to the smallest cursor page, so 21 or more compartment resources span
 * several pages. The spy is restored after each test.
 */
function useSmallCompartmentPages(): void {
  const originalSearch = Repository.prototype.search;
  vi.spyOn(Repository.prototype, 'search').mockImplementation(function (
    this: Repository,
    ...args: Parameters<typeof originalSearch>
  ) {
    const [searchRequest, options] = args;
    const isCompartment = searchRequest.filters?.some((f) => f.code === '_compartment');
    return originalSearch.call(this, isCompartment ? { ...searchRequest, count: 20 } : searchRequest, options);
  });
}

/**
 * Lists the resource types written by `$set-accounts` while propagating to the compartment.
 * @param transactionSpy - A spy on `Repository.withTransaction`.
 * @returns The resource type of each compartment write transaction.
 */
function compartmentWrites(transactionSpy: MockInstance<Repository['withTransaction']>): string[] {
  return transactionSpy.mock.calls
    .filter(([, options]) => options.source === 'setAccounts.compartment')
    .map(([, options]) => (options.resourceTypes as string[])[0]);
}

/**
 * Spies on `Repository.updateResource`, running `hook` around each call (before it by default). The spy is
 * restored after each test.
 * @param hook - Called with the resource being updated and the unspied `updateResource`, for writes that
 *   should bypass the spy.
 * @param timing - Whether `hook` runs before or after the real update.
 */
function spyOnUpdateResource(
  hook: (resource: Resource, originalUpdate: Repository['updateResource']) => Promise<void>,
  timing: 'before' | 'after' = 'before'
): void {
  const originalUpdate = Repository.prototype.updateResource;
  vi.spyOn(Repository.prototype, 'updateResource').mockImplementation(async function (
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
}

/**
 * Spies on `Repository.readResource`, running `hook` before each call. The spy is restored after each test.
 * @param hook - Called with the type and ID of the resource being read.
 */
function spyOnReadResource(hook: (resourceType: string, id: string) => Promise<void>): void {
  const originalRead = Repository.prototype.readResource;
  vi.spyOn(Repository.prototype, 'readResource').mockImplementation(async function (
    this: Repository,
    ...args: Parameters<typeof originalRead>
  ) {
    await hook(args[0], args[1]);
    return originalRead.apply(this, args);
  });
}

async function createExtended<T extends Resource>(resource: T): Promise<WithId<T>> {
  const res = await request(app)
    .post(`/fhir/R4/${resource.resourceType}`)
    .set('X-Medplum', 'extended')
    .set('Authorization', 'Bearer ' + accessToken)
    .send(resource);
  expect(res).toHaveStatus(201);
  return res.body as WithId<T>;
}

async function readExtended<T extends Resource = Resource>(ref: string): Promise<T> {
  const res = await request(app)
    .get(`/fhir/R4/${ref}`)
    .set('X-Medplum', 'extended')
    .set('Authorization', 'Bearer ' + accessToken);
  expect(res).toHaveStatus(200);
  return res.body as T;
}
