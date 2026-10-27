// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString, Logger } from '@medplum/core';
import type { AsyncJob, Binary } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { addTestUser, createTestProject, waitForAsyncJob, withTestContext } from '../test.setup';
import { AsyncJobExecutor } from './operations/utils/asyncjobexecutor';
import { getProjectSystemRepo } from './repo';

const app = express();

describe('Job status', () => {
  let accessToken: string;
  let asyncJobManager: AsyncJobExecutor;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(async () => {
    const testProject = await createTestProject({ withAccessToken: true, withRepo: true });
    accessToken = testProject.accessToken;
    asyncJobManager = new AsyncJobExecutor(testProject.repo);
  });

  test('in progress', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');

      const res = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res).toHaveStatus(202);
      expect(res.get('Content-Type')).toStrictEqual('application/fhir+json; charset=utf-8');
      expect(res.body).toStrictEqual(expect.objectContaining({ id: job.id, request: job.request, status: 'accepted' }));
    }));

  test('completed', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');
      const callback = vi.fn();

      asyncJobManager.start(async () => {
        callback();
      });

      expect(callback).toHaveBeenCalled();

      await waitForAsyncJob(asyncJobManager.getContentLocation('http://example.com/'), app, accessToken);

      const res = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res).toHaveStatus(200);
      expect(res.get('Content-Type')).toStrictEqual('application/fhir+json; charset=utf-8');
      expect(res.body).toStrictEqual(
        expect.objectContaining({ id: job.id, request: job.request, status: 'completed' })
      );
    }));

  test('Cancel -- Happy path', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');

      const res1 = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res1).toHaveStatus(202);
      expect(res1.body?.status).toStrictEqual('accepted');

      // Cancel the job
      const res2 = await request(app)
        .delete(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res2).toHaveStatus(202);
      expect(res2.body).toMatchObject({
        resourceType: 'OperationOutcome',
        id: 'accepted',
        issue: [
          {
            severity: 'information',
            code: 'informational',
            details: {
              text: 'Accepted',
            },
          },
        ],
      });

      // Check if AsyncJob.status === 'cancelled'
      const res3 = await request(app)
        .get(`/fhir/R4/AsyncJob/${job.id}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON);

      expect(res3).toHaveStatus(200);
      expect(res3.body).toMatchObject<AsyncJob>({
        id: job.id,
        resourceType: 'AsyncJob',
        status: 'cancelled',
        requestTime: job.requestTime,
        request: 'http://example.com',
      });

      // Verify the status polling endpoint returns 200 (not 202) for cancelled jobs
      // so that the client stops polling (fixes #5575)
      const res4 = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res4).toHaveStatus(200);
      expect(res4.body).toStrictEqual(
        expect.objectContaining({ id: job.id, request: job.request, status: 'cancelled' })
      );
    }));

  test('Cancel -- error (job already completed)', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');
      const callback = vi.fn();

      asyncJobManager.start(async () => {
        callback();
      });

      expect(callback).toHaveBeenCalled();

      await waitForAsyncJob(asyncJobManager.getContentLocation('http://example.com/'), app, accessToken);

      const res = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res).toHaveStatus(200);
      expect(res.get('Content-Type')).toStrictEqual('application/fhir+json; charset=utf-8');
      expect(res.body).toStrictEqual(
        expect.objectContaining({ id: job.id, request: job.request, status: 'completed' })
      );

      // Now try to cancel the job after it's already completed
      const res2 = await request(app)
        .delete(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res2).toHaveStatus(400);
      expect(res2.get('Content-Type')).toStrictEqual('application/fhir+json; charset=utf-8');
      expect(res2.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            code: 'invalid',
            details: {
              text: "AsyncJob cannot be cancelled if status is not 'accepted', job had status 'completed'",
            },
            severity: 'error',
          },
        ],
      });
    }));

  test('Updating a job keeps its requester', async () => {
    const { project } = await createTestProject();
    const systemRepo = await getProjectSystemRepo(project);
    const job = await systemRepo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'completed',
      request: 'http://example.com/',
      requestTime: new Date().toISOString(),
      meta: { project: project.id },
    });
    const member = await addTestUser(project);

    const updateRes = await request(app)
      .put(`/fhir/R4/AsyncJob/${job.id}`)
      .set('Authorization', 'Bearer ' + member.accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...job, requester: createReference(member.profile) });
    expect(updateRes).toHaveStatus(200);
    expect(updateRes.body.requester).toBeUndefined();
  });

  test('Reads of job output by other members are logged', async () => {
    const { project } = await createTestProject();
    const requester = await addTestUser(project);
    const otherMember = await addTestUser(project);
    const binaryReader = await addTestUser(project);

    const createRes = await request(app)
      .post('/fhir/R4/AsyncJob')
      .set('Authorization', 'Bearer ' + requester.accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'AsyncJob',
        status: 'completed',
        request: 'http://example.com/',
        requestTime: new Date().toISOString(),
        output: { resourceType: 'Parameters', parameter: [{ name: 'result', valueString: 'test' }] },
      });
    expect(createRes).toHaveStatus(201);
    const job = createRes.body as AsyncJob;
    expect(job.requester?.reference).toStrictEqual(getReferenceString(requester.profile));
    const binary = await (
      await getProjectSystemRepo(project)
    ).createResource<Binary>({
      resourceType: 'Binary',
      contentType: ContentType.TEXT,
      securityContext: createReference(job),
      meta: { project: project.id },
    });

    const warnSpy = vi.spyOn(Logger.prototype, 'warn');
    try {
      for (const [member, path] of [
        [requester, `/fhir/R4/AsyncJob/${job.id}`],
        [otherMember, `/fhir/R4/AsyncJob/${job.id}`],
        [otherMember, `/fhir/R4/job/${job.id}/status`],
        [binaryReader, `/fhir/R4/Binary/${binary.id}`],
      ] as const) {
        const res = await request(app)
          .get(path)
          .set('Authorization', 'Bearer ' + member.accessToken)
          .set('Accept', ContentType.FHIR_JSON);
        expect(res).toHaveStatus(200);
      }

      const calls = warnSpy.mock.calls.filter(([msg]) => msg === 'AsyncJob output read by another user');
      expect(calls.map(([, data]) => data)).toStrictEqual(
        [otherMember, binaryReader].map((member) => ({
          asyncJobId: job.id,
          projectId: project.id,
          requester: getReferenceString(requester.profile),
          reader: getReferenceString(member.profile),
          suppressed: 0,
        }))
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
