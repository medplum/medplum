import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
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
        projects: [testProject.project.id as string],
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
      expect(res.get('Content-Type')).toEqual('application/fhir+json; charset=utf-8');
      expect(res.body).toEqual(expect.objectContaining({ id: job.id, request: job.request, status: 'accepted' }));
    }));

  test('completed', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');
      const callback = jest.fn();

      await asyncJobManager.start(async () => {
        callback();
      });

      expect(callback).toHaveBeenCalled();

      await waitForAsyncJob(asyncJobManager.getContentLocation('http://example.com/'), app, accessToken);

      const res = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(200);
      expect(res.get('Content-Type')).toEqual('application/fhir+json; charset=utf-8');
      expect(res.body).toEqual(expect.objectContaining({ id: job.id, request: job.request, status: 'completed' }));
    }));

  test('cancel', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');

      const res = await request(app)
        .delete(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(202);
      expect(res.get('Content-Type')).toEqual('text/plain; charset=utf-8');
      expect(res.body).toEqual({});
    }));
});
