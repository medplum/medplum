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

  describe.each([
    {
      route: 'POST AsyncJob/:id/$cancel',
      send: (id: string) => request(app).post(`/fhir/R4/AsyncJob/${id}/$cancel`),
      okStatus: 200,
    },
    {
      route: 'DELETE job/:id/status',
      send: (id: string) => request(app).delete(`/fhir/R4/job/${id}/status`),
      okStatus: 202,
    },
  ])('Requester or admin only: $route', ({ send, okStatus }) => {
    let project: WithId<Project>;
    let adminToken: string;
    let requester: Awaited<ReturnType<typeof addTestUser>>;
    let otherMember: Awaited<ReturnType<typeof addTestUser>>;
    let readOnlyMember: Awaited<ReturnType<typeof addTestUser>>;
    let linkedToken: string;

    beforeAll(async () => {
      ({ project, accessToken: adminToken } = await createTestProject({
        withAccessToken: true,
        membership: { admin: true },
      }));
      requester = await addTestUser(project);
      otherMember = await addTestUser(project, {
        accessPolicy: { resourceType: 'AccessPolicy', resource: [{ resourceType: '*' }] },
      });
      readOnlyMember = await addTestUser(project, {
        accessPolicy: { resourceType: 'AccessPolicy', resource: [{ resourceType: 'AsyncJob', readonly: true }] },
      });
      // An admin of their own project, to show that admin status does not carry across the link
      ({ accessToken: linkedToken } = await createTestProject({
        withAccessToken: true,
        membership: { admin: true },
        project: { link: [{ project: createReference(project) }] },
      }));
    });

    async function createJob(
      jobRequester: AsyncJob['requester'],
      status: AsyncJob['status'] = 'accepted'
    ): Promise<WithId<AsyncJob>> {
      return (await getProjectSystemRepo(project)).createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        meta: { project: project.id },
        status,
        requestTime: new Date().toISOString(),
        request: 'random-request',
        requester: jobRequester,
      });
    }

    async function cancel(token: string, job: WithId<AsyncJob>): Promise<request.Response> {
      return send(job.id).set('Authorization', 'Bearer ' + token);
    }

    async function expectStatus(job: WithId<AsyncJob>, status: AsyncJob['status']): Promise<void> {
      const stored = await (await getProjectSystemRepo(project)).readResource<AsyncJob>('AsyncJob', job.id);
      expect(stored.status).toStrictEqual(status);
    }

    test('Requester can cancel', async () => {
      const job = await createJob(createReference(requester.profile));
      expect(await cancel(requester.accessToken, job)).toHaveStatus(okStatus);
      await expectStatus(job, 'cancelled');
    });

    test('Project admin can cancel the job of another member', async () => {
      const job = await createJob(createReference(requester.profile));
      expect(await cancel(adminToken, job)).toHaveStatus(okStatus);
      await expectStatus(job, 'cancelled');
    });

    test('Super admin can cancel', async () => {
      const { accessToken: superAdminToken } = await getSuperAdminTestProject();
      const job = await createJob(createReference(requester.profile));
      expect(await cancel(superAdminToken, job)).toHaveStatus(okStatus);
      await expectStatus(job, 'cancelled');
    });

    test.each(['accepted', 'completed'] as const)(
      'Forbidden for a non-admin member who is not the requester, job status %s',
      async (status) => {
        const job = await createJob(createReference(requester.profile), status);
        const warnSpy = vi.spyOn(Logger.prototype, 'warn');
        try {
          const res = await cancel(otherMember.accessToken, job);
          expect(res).toHaveStatus(403);
          expect(res.body).toMatchObject(forbidden);
          expect(warnSpy).toHaveBeenCalledWith('AsyncJob accessed by another user', {
            asyncJobId: job.id,
            projectId: project.id,
            requester: getReferenceString(requester.profile),
            reader: getReferenceString(otherMember.profile),
            suppressed: 0,
          });
        } finally {
          warnSpy.mockRestore();
        }
        await expectStatus(job, status);
      }
    );

    test('Forbidden with read-only AsyncJob access, even for the requester', async () => {
      const job = await createJob(createReference(readOnlyMember.profile));
      const res = await cancel(readOnlyMember.accessToken, job);
      expect(res).toHaveStatus(403);
      expect(res.body).toMatchObject(forbidden);
      await expectStatus(job, 'accepted');
    });

    test('Forbidden for a member of a linked project', async () => {
      const job = await createJob(createReference(requester.profile));
      const read = await request(app)
        .get(`/fhir/R4/AsyncJob/${job.id}`)
        .set('Authorization', 'Bearer ' + linkedToken);
      expect(read).toHaveStatus(200);

      const res = await cancel(linkedToken, job);
      expect(res).toHaveStatus(403);
      expect(res.body).toMatchObject(forbidden);
      await expectStatus(job, 'accepted');
    });

    test('Job without requester can be cancelled by an admin only', async () => {
      const job = await createJob(undefined);
      const res = await cancel(otherMember.accessToken, job);
      expect(res).toHaveStatus(403);
      expect(res.body).toMatchObject(forbidden);
      await expectStatus(job, 'accepted');

      expect(await cancel(adminToken, job)).toHaveStatus(okStatus);
      await expectStatus(job, 'cancelled');
    });
  });
});
