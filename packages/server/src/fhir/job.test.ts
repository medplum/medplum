// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, waitForAsyncJob, withTestContext } from '../test.setup';
import { AsyncJobExecutor } from './operations/utils/asyncjobexecutor';
import { Repository } from './repo';

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
    const testProject = await createTestProject({ withAccessToken: true });
    accessToken = testProject.accessToken;
    asyncJobManager = new AsyncJobExecutor(
      new Repository({
        projects: [testProject.project],
        author: { reference: 'User/' + randomUUID() },
      })
    );
  });

  test('in progress', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');

      const res = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(202);
      expect(res.get('Content-Type')).toStrictEqual('application/fhir+json; charset=utf-8');
      expect(res.body).toStrictEqual(expect.objectContaining({ id: job.id, request: job.request, status: 'accepted' }));
    }));

  test('completed', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');
      const callback = jest.fn();

      asyncJobManager.start(async () => {
        callback();
      });

      expect(callback).toHaveBeenCalled();

      await waitForAsyncJob(asyncJobManager.getContentLocation('http://example.com/'), app, accessToken);

      const res = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(200);
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
      expect(res1.status).toStrictEqual(202);
      expect(res1.body?.status).toStrictEqual('accepted');

      // Cancel the job
      const res2 = await request(app)
        .delete(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res2.status).toStrictEqual(202);
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

      expect(res3.status).toStrictEqual(200);
      expect(res3.body).toMatchObject<AsyncJob>({
        id: job.id,
        resourceType: 'AsyncJob',
        status: 'cancelled',
        requestTime: job.requestTime,
        request: 'http://example.com',
      });
    }));

  test('Cancel -- error (job already completed)', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');
      const callback = jest.fn();

      asyncJobManager.start(async () => {
        callback();
      });

      expect(callback).toHaveBeenCalled();

      await waitForAsyncJob(asyncJobManager.getContentLocation('http://example.com/'), app, accessToken);

      const res = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(200);
      expect(res.get('Content-Type')).toStrictEqual('application/fhir+json; charset=utf-8');
      expect(res.body).toStrictEqual(
        expect.objectContaining({ id: job.id, request: job.request, status: 'completed' })
      );

      // Now try to cancel the job after it's already completed
      const res2 = await request(app)
        .delete(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res2.status).toBe(400);
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
});
