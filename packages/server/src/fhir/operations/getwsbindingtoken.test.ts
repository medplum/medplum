import { ContentType } from '@medplum/core';
import { Parameters, Subscription } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('Get WebSocket binding token', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Basic', async () => {
    // Create Subscription
    const res1 = await request(app)
      .post(`/fhir/R4/Subscription`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'websocket',
        },
      } satisfies Subscription);
    const createdSub = res1.body as Subscription;
    expect(res1.status).toBe(201);
    expect(createdSub).toBeDefined();
    expect(createdSub.id).toBeDefined();

    // Start the export
    const res2 = await request(app)
      .get(`/fhir/R4/Subscription/${createdSub.id}/$get-ws-binding-token`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    expect(res2.body).toBeDefined();

    const params = res2.body as Parameters;
    expect(params.resourceType).toEqual('Parameters');
    expect(params.parameter?.length).toEqual(3);
    expect(params.parameter?.[0]).toBeDefined();
    expect(params.parameter?.[0].name).toEqual('token');
    expect(params.parameter?.[0].valueString).toBeDefined();
    expect(params.parameter?.[1]).toBeDefined();
    expect(params.parameter?.[1].name).toEqual('expiration');
    expect(params.parameter?.[1].valueDateTime).toBeDefined();
    expect(new Date(params.parameter?.[1].valueDateTime as string).getTime()).toBeGreaterThanOrEqual(Date.now());
    expect(params.parameter?.[2]).toBeDefined();
    expect(params.parameter?.[2].name).toEqual('websocket-url');
    expect(params.parameter?.[2].valueUrl).toBeDefined();
  });
});
