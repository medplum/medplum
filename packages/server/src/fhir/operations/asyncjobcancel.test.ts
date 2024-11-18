import { allOk, badRequest, ContentType, sleep } from '@medplum/core';
import { AsyncJob, OperationOutcome } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';
import { asyncJobCancelHandler } from './asyncjobcancel';

const app = express();

describe('AsyncJob/$cancel', () => {
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
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
    expect(outcome).toMatchObject<OperationOutcome>(badRequest(`Test failed: ${status} != accepted`));
  });

  test('Fails if not executed on an instance (no ID given)', async () => {
    const next = jest.fn();
    expect(() => asyncJobCancelHandler({ params: {} } as express.Request, {} as express.Response, next)).not.toThrow();
    while (next.mock.calls.length === 0) {
      await sleep(100);
    }
    expect(next).toHaveBeenCalledWith(new Error('This operation can only be executed on an instance'));
  });

  test('Responds with bad request outcome if error thrown', async () => {
    const next = jest.fn();

    class MockResponse {
      type = jest.fn().mockImplementation(() => this);
      status = jest.fn().mockImplementation(() => this);
      json = jest.fn().mockImplementation(() => this);
    }

    const mockResponse = new MockResponse();

    expect(() =>
      asyncJobCancelHandler(
        { params: { id: 'fake-id' } as Record<string, string> } as express.Request,
        mockResponse as unknown as express.Response,
        next
      )
    ).not.toThrow();

    while (mockResponse.json.mock.calls.length === 0) {
      await sleep(100);
    }

    expect(mockResponse.type).toHaveBeenCalledWith(ContentType.FHIR_JSON);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining<OperationOutcome>(badRequest('No request context available'))
    );
  });
});
