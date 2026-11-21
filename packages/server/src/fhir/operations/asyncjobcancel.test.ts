// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest, ContentType, createReference, forbidden, getReferenceString, Logger } from '@medplum/core';
import type { FhirRequest } from '@medplum/fhir-router';
import type { AsyncJob, OperationOutcome, Project } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { addTestUser, createTestProject, getSuperAdminTestProject, withTestContext } from '../../test.setup';
import type { Repository } from '../repo';
import { getProjectSystemRepo } from '../repo';
import { asyncJobCancelHandler } from './asyncjobcancel';

const app = express();

describe('AsyncJob/$cancel', () => {
  let accessToken: string;
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
  });

  beforeEach(async () => {
    ({ accessToken, repo } = await getSuperAdminTestProject());
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Sets AsyncJob.status to `cancelled`', async () => {
    const res = await request(app)
      .post('/fhir/R4/AsyncJob')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: 'random-request',
      } satisfies AsyncJob);
    expect(res).toHaveStatus(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id}/$cancel`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    expect(res2.body).toMatchObject(allOk);

    const res3 = await request(app)
      .get(`/fhir/R4/AsyncJob/${asyncJob.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);

    expect(res3).toHaveStatus(200);
    expect(res3.body).toMatchObject<AsyncJob>({
      id: asyncJob.id,
      resourceType: 'AsyncJob',
      status: 'cancelled',
      requestTime: asyncJob.requestTime,
      request: 'random-request',
    });
  });

  test('No-op when AsyncJob is already `cancelled`', async () => {
    const res = await request(app)
      .post('/fhir/R4/AsyncJob')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'AsyncJob',
        status: 'cancelled',
        requestTime: new Date().toISOString(),
        request: 'random-request',
      } satisfies AsyncJob);
    expect(res).toHaveStatus(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id}/$cancel`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    expect(res2.body).toMatchObject(allOk);

    const res3 = await request(app)
      .get(`/fhir/R4/AsyncJob/${asyncJob.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);

    expect(res3).toHaveStatus(200);
    expect(res3.body).toMatchObject<AsyncJob>({
      id: asyncJob.id,
      resourceType: 'AsyncJob',
      status: 'cancelled',
      requestTime: asyncJob.requestTime,
      request: 'random-request',
    });
  });

  test.each(['completed', 'error'] as const)('Fails if AsyncJob.status is `%s`', async (status) => {
    const res = await request(app)
      .post('/fhir/R4/AsyncJob')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'AsyncJob',
        status,
        requestTime: new Date().toISOString(),
        request: 'random-request',
      } satisfies AsyncJob);
    expect(res).toHaveStatus(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id}/$cancel`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(400);

    const outcome = res2.body as OperationOutcome;
    expect(outcome).toMatchObject(
      badRequest(`AsyncJob cannot be cancelled if status is not 'accepted', job had status '${status}'`)
    );
  });

  test('Fails if not executed on an instance (no ID given)', async () => {
    const req = {
      method: 'POST',
      url: 'AsyncJob/$cancel',
      pathname: '',
      params: {},
      query: {},
      body: '',
      headers: {},
    } satisfies FhirRequest;
    await expect(asyncJobCancelHandler(req)).rejects.toThrow(
      new Error('This operation can only be executed on an instance')
    );
  });

  test('Cancelled job does not get added to super admin project', () =>
    withTestContext(async () => {
      // We create the resource with system repo so that it is like how system AsyncJobs get created
      const asyncJob = await repo.getSystemRepo().createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: 'random-request',
      });

      const res2 = await request(app)
        .post(`/fhir/R4/AsyncJob/${asyncJob.id}/$cancel`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended');
      expect(res2).toHaveStatus(200);
      expect(res2.body).toMatchObject(allOk);

      const res3 = await request(app)
        .get(`/fhir/R4/AsyncJob/${asyncJob.id}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended');

      expect(res3).toHaveStatus(200);
      expect(res3.body).toStrictEqual({
        id: asyncJob.id,
        resourceType: 'AsyncJob',
        requestTime: asyncJob.requestTime,
        request: 'random-request',
        status: 'cancelled',
        meta: {
          lastUpdated: expect.any(String),
          versionId: expect.any(String),
          author: {
            reference: 'system',
          },
          // We make sure meta does not contain project
        },
      });
    }));

  describe('Access', () => {
    let project: WithId<Project>;
    let requester: Awaited<ReturnType<typeof addTestUser>>;
    let otherMember: Awaited<ReturnType<typeof addTestUser>>;
    let readOnlyMember: Awaited<ReturnType<typeof addTestUser>>;
    let linkedToken: string;

    beforeAll(async () => {
      ({ project } = await createTestProject({ membership: { admin: true } }));
      requester = await addTestUser(project);
      otherMember = await addTestUser(project, {
        accessPolicy: { resourceType: 'AccessPolicy', resource: [{ resourceType: '*' }] },
      });
      readOnlyMember = await addTestUser(project, {
        accessPolicy: { resourceType: 'AccessPolicy', resource: [{ resourceType: 'AsyncJob', readonly: true }] },
      });
      // Admin status does not carry across the project link
      ({ accessToken: linkedToken } = await createTestProject({
        withAccessToken: true,
        membership: { admin: true },
        project: { link: [{ project: createReference(project) }] },
      }));
    });

    async function createJob(jobRequester: AsyncJob['requester']): Promise<WithId<AsyncJob>> {
      return (await getProjectSystemRepo(project)).createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        meta: { project: project.id },
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: 'random-request',
        requester: jobRequester,
      });
    }

    function cancel(token: string, job: WithId<AsyncJob>): request.Test {
      return request(app)
        .post(`/fhir/R4/AsyncJob/${job.id}/$cancel`)
        .set('Authorization', 'Bearer ' + token);
    }

    async function expectStatus(job: WithId<AsyncJob>, status: AsyncJob['status']): Promise<void> {
      const stored = await (await getProjectSystemRepo(project)).readResource<AsyncJob>('AsyncJob', job.id);
      expect(stored.status).toStrictEqual(status);
    }

    test('Requester can cancel', async () => {
      const job = await createJob(createReference(requester.profile));
      const res = await cancel(requester.accessToken, job);
      expect(res).toHaveStatus(200);
      await expectStatus(job, 'cancelled');
    });

    test('Forbidden with read-only AsyncJob access', async () => {
      const job = await createJob(createReference(readOnlyMember.profile));
      const res = await cancel(readOnlyMember.accessToken, job);
      expect(res).toHaveStatus(403);
      expect(res.body).toMatchObject(forbidden);
      await expectStatus(job, 'accepted');
    });

    test('Forbidden for an admin of a linked project', async () => {
      const job = await createJob(createReference(requester.profile));
      const res = await cancel(linkedToken, job);
      expect(res).toHaveStatus(403);
      expect(res.body).toMatchObject(forbidden);
      await expectStatus(job, 'accepted');
    });

    test('Non-requester with write access can cancel, and is logged', async () => {
      const job = await createJob(createReference(requester.profile));
      // Each request logs with its own Logger instance, so spy on the prototype
      const infoSpy = vi.spyOn(Logger.prototype, 'info');
      try {
        const res = await cancel(otherMember.accessToken, job);
        expect(res).toHaveStatus(200);
        expect(infoSpy).toHaveBeenCalledWith('AsyncJob cancelled', {
          asyncJobId: job.id,
          requester: getReferenceString(requester.profile),
          canceller: getReferenceString(otherMember.profile),
        });
      } finally {
        infoSpy.mockRestore();
      }
      await expectStatus(job, 'cancelled');
    });
  });
});
