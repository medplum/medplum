import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { AsyncJobExecutor } from './operations/utils/asyncjobexecutor';
import { systemRepo } from './repo';
import { initTestAuth } from '../test.setup';

const app = express();

describe('AsyncJob status', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('in progress', async () => {
    const asyncJobManager = new AsyncJobExecutor(systemRepo);
    const accessToken = await initTestAuth();

    const job = await asyncJobManager.start('http://example.com');

    const res = await request(app)
      .get(`/fhir/R4/AsyncJob/${job.id}/status`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(202);
  });

  test('completed', async () => {
    const asyncJobManager = new AsyncJobExecutor(systemRepo);
    const accessToken = await initTestAuth();

    const job = await asyncJobManager.start('http://example.com');
    const callback = jest.fn();

    await asyncJobManager.run(async () => {
      callback();
    });

    expect(callback).toBeCalled();

    const resCompleted = await request(app)
      .get(`/fhir/R4/AsyncJob/${job.id}/status`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(resCompleted.status).toBe(200);
    expect(resCompleted.body).toMatchObject({
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [
        {
          response: {
            location: 'http://example.com',
            status: '200 OK',
          },
        },
      ],
    });
  });

  test('cancel', async () => {
    const asyncJobManager = new AsyncJobExecutor(systemRepo);
    const accessToken = await initTestAuth();

    const job = await asyncJobManager.start('http://example.com');

    const res = await request(app)
      .delete(`/fhir/R4/AsyncJob/${job.id}/status`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(202);
  });
});
