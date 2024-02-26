import { AsyncJob } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { createTestProject, withTestContext } from '../test.setup';
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
    }));

  test('completed', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');
      const callback = jest.fn();

      await asyncJobManager.run(async () => {
        callback();
      });

      expect(callback).toHaveBeenCalled();

      const resCompleted = await request(app)
        .get(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(resCompleted.status).toBe(200);
      expect(resCompleted.body).toMatchObject<Partial<AsyncJob>>({
        resourceType: 'AsyncJob',
        status: 'completed',
      });
    }));

  test('cancel', () =>
    withTestContext(async () => {
      const job = await asyncJobManager.init('http://example.com');

      const res = await request(app)
        .delete(`/fhir/R4/job/${job.id}/status`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(202);
    }));
});
