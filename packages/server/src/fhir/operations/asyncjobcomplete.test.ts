import { badRequest, ContentType, forbidden } from '@medplum/core';
import { FhirRequest } from '@medplum/fhir-router';
import { AsyncJob, OperationOutcome } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import * as databaseModule from '../../database';
import { initTestAuth, withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';
import { asyncJobCompleteHandler } from './asyncjobcomplete';

const app = express();

describe('AsyncJob/$complete', () => {
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

  test('Runs `completeJob` on a job and marks it as `completed`', async () => {
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
    expect(res.status).toStrictEqual(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id as string}/$complete`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toStrictEqual(200);
    expect(res2.body).toMatchObject<AsyncJob>({
      id: asyncJob.id,
      resourceType: 'AsyncJob',
      status: 'completed',
      requestTime: asyncJob.requestTime,
      request: 'random-request',
    });

    const res3 = await request(app)
      .get(`/fhir/R4/AsyncJob/${asyncJob.id as string}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);

    expect(res3.status).toStrictEqual(200);
    expect(res3.body).toMatchObject<AsyncJob>({
      id: asyncJob.id,
      resourceType: 'AsyncJob',
      status: 'completed',
      requestTime: asyncJob.requestTime,
      request: 'random-request',
    });
  });

  test('DatabaseMigration table is updated when a data-migration job is completed', async () => {
    const markDataMigrateCompleteSpy = jest.spyOn(databaseModule, 'markPendingDataMigrationCompleted');

    const res = await request(app)
      .post('/fhir/R4/AsyncJob')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'AsyncJob',
        type: 'data-migration',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: 'random-request',
        dataVersion: 1337,
        minServerVersion: '3.3.0',
      } satisfies AsyncJob);
    expect(res.status).toStrictEqual(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id as string}/$complete`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toStrictEqual(200);
    expect(res2.body).toMatchObject<AsyncJob>({
      id: asyncJob.id,
      resourceType: 'AsyncJob',
      status: 'completed',
      requestTime: asyncJob.requestTime,
      request: 'random-request',
    });

    const res3 = await request(app)
      .get(`/fhir/R4/AsyncJob/${asyncJob.id as string}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);

    expect(res3.status).toStrictEqual(200);
    expect(res3.body).toMatchObject<AsyncJob>({
      id: asyncJob.id,
      type: 'data-migration',
      resourceType: 'AsyncJob',
      status: 'completed',
      requestTime: asyncJob.requestTime,
      request: 'random-request',
    });
    expect(markDataMigrateCompleteSpy).toHaveBeenCalledWith(res.body);
  });

  test('Requires super admin access', async () => {
    const nonAdminToken = await initTestAuth({ superAdmin: false });
    const res = await request(app)
      .post('/fhir/R4/AsyncJob')
      .set('Authorization', 'Bearer ' + nonAdminToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: 'random-request',
      } satisfies AsyncJob);
    expect(res.status).toStrictEqual(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id as string}/$complete`)
      .set('Authorization', 'Bearer ' + nonAdminToken);
    expect(res2.status).toStrictEqual(403);
    expect(res2.body).toMatchObject<OperationOutcome>(forbidden);
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
    expect(res.status).toStrictEqual(201);
    expect(res.body).toBeDefined();

    const asyncJob = res.body as AsyncJob;

    const res2 = await request(app)
      .post(`/fhir/R4/AsyncJob/${asyncJob.id as string}/$complete`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toStrictEqual(400);

    const outcome = res2.body as OperationOutcome;
    expect(outcome).toMatchObject<OperationOutcome>(
      badRequest(`AsyncJob cannot be completed if status is not 'accepted', job has status '${status}'`)
    );
  });

  test('Fails if not executed on an instance (no ID given)', async () => {
    const req = {
      method: 'POST',
      url: 'AsyncJob/$complete',
      pathname: '',
      params: {},
      query: {},
      body: '',
      headers: {},
    } satisfies FhirRequest;
    await expect(asyncJobCompleteHandler(req)).rejects.toThrow(
      new Error('This operation can only be executed on an instance')
    );
  });

  test('Completed job does not get added to super admin project', () =>
    withTestContext(async () => {
      // We create the resource with system repo so that it is like how system AsyncJobs get created
      const asyncJob = await getSystemRepo().createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: 'random-request',
      });

      const res2 = await request(app)
        .post(`/fhir/R4/AsyncJob/${asyncJob.id as string}/$complete`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended');
      expect(res2.status).toStrictEqual(200);
      expect(res2.body).toMatchObject({
        id: asyncJob.id,
        resourceType: 'AsyncJob',
        status: 'completed',
        requestTime: asyncJob.requestTime,
        request: 'random-request',
      });

      const res3 = await request(app)
        .get(`/fhir/R4/AsyncJob/${asyncJob.id}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended');

      expect(res3.status).toStrictEqual(200);
      expect(res3.body).toStrictEqual({
        id: asyncJob.id as string,
        resourceType: 'AsyncJob',
        requestTime: asyncJob.requestTime,
        request: 'random-request',
        status: 'completed',
        meta: {
          lastUpdated: expect.any(String),
          versionId: expect.any(String),
          author: {
            reference: 'system',
          },
          // We make sure meta does not contain project
        },
        transactionTime: expect.any(String),
      });
    }));
});
