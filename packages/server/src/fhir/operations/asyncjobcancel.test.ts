import { allOk, badRequest, ContentType, sleep } from '@medplum/core';
import { AsyncJob, OperationOutcome } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth, withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';
import { asyncJobCancelHandler } from './asyncjobcancel';

const app = express();

describe('AsyncJob/$cancel', () => {
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
  });

  beforeEach(async () => {
    accessToken = await initTestAuth({ superAdmin: true });
    expect(accessToken).toBeDefined();
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
    expect(res.status).toEqual(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id as string}/$cancel`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toEqual(200);
    expect(res2.body).toMatchObject<OperationOutcome>(allOk);

    const res3 = await request(app)
      .get(`/fhir/R4/AsyncJob/${asyncJob.id as string}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);

    expect(res3.status).toEqual(200);
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
    expect(res.status).toEqual(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id as string}/$cancel`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toEqual(200);
    expect(res2.body).toMatchObject<OperationOutcome>(allOk);

    const res3 = await request(app)
      .get(`/fhir/R4/AsyncJob/${asyncJob.id as string}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);

    expect(res3.status).toEqual(200);
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
    expect(res.status).toEqual(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id as string}/$cancel`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toEqual(400);

    const outcome = res2.body as OperationOutcome;
    expect(outcome).toMatchObject<OperationOutcome>(
      badRequest(`AsyncJob cannot be cancelled if status is not 'accepted', job had status '${status}'`)
    );
  });

  test('Fails if not executed on an instance (no ID given)', async () => {
    const next = jest.fn();
    expect(() => asyncJobCancelHandler({ params: {} } as express.Request, {} as express.Response, next)).not.toThrow();
    while (next.mock.calls.length === 0) {
      await sleep(100);
    }
    expect(next).toHaveBeenCalledWith(new Error('This operation can only be executed on an instance'));
  });

  test('Cancelled job does not get added to super admin project', () =>
    withTestContext(async () => {
      // We create the resource with system repo so that it is like how system AsyncJobs get created
      const asyncJob = await getSystemRepo().createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: 'random-request',
      });

      const res2 = await request(app)
        .post(`/fhir/R4/AsyncJob/${asyncJob.id as string}/$cancel`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended');
      expect(res2.status).toEqual(200);
      expect(res2.body).toMatchObject(allOk);

      const res3 = await request(app)
        .get(`/fhir/R4/AsyncJob/${asyncJob.id}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended');

      expect(res3.status).toEqual(200);
      expect(res3.body).toEqual({
        id: asyncJob.id as string,
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
});
