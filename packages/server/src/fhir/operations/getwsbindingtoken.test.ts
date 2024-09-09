import { ContentType } from '@medplum/core';
import { OperationOutcome, Parameters, Subscription } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { verifyJwt } from '../../oauth/keys';
import { initTestAuth, withTestContext } from '../../test.setup';

const app = express();
let accessToken: string;

describe('Get WebSocket binding token', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ project: { features: ['websocket-subscriptions'] } });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Basic', () =>
    withTestContext(async () => {
      // Create Subscription
      const res1 = await request(app)
        .post('/fhir/R4/Subscription')
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
      expect(params.parameter?.length).toBeDefined();
      expect([3, 4]).toContain(params.parameter?.length);
      expect(params.parameter?.[0]).toBeDefined();
      expect(params.parameter?.[0]?.name).toEqual('token');

      const token = params.parameter?.[0]?.valueString as string;
      expect(token).toBeDefined();

      const { payload } = await verifyJwt(token);
      expect(payload?.sub).toBeDefined();
      expect(payload?.exp).toBeDefined();
      expect(payload?.aud).toBeDefined();
      expect(payload?.username).toBeDefined();
      expect(payload?.subscription_id).toBeDefined();

      expect(params.parameter?.[1]).toBeDefined();
      expect(params.parameter?.[1]?.name).toEqual('expiration');
      expect(params.parameter?.[1]?.valueDateTime).toBeDefined();
      expect(new Date(params.parameter?.[1]?.valueDateTime as string).getTime()).toBeGreaterThanOrEqual(Date.now());

      expect(params.parameter?.[2]).toBeDefined();
      expect(params.parameter?.[2]?.name).toEqual('subscription');
      expect(params.parameter?.[2]?.valueString).toBeDefined();
      expect(params.parameter?.[2]?.valueString).toEqual(createdSub.id);

      expect(params.parameter?.[3]).toBeDefined();
      expect(params.parameter?.[3]?.name).toEqual('websocket-url');
      expect(params.parameter?.[3]?.valueUrl).toBeDefined();
    }));

  test('should return OperationOutcome error if Subscription no longer exists', () =>
    withTestContext(async () => {
      // Create subscription to watch patient
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

      const res2 = await request(app)
        .delete(`/fhir/R4/Subscription/${createdSub.id as string}`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res2.body).toMatchObject<OperationOutcome>({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'information', code: 'informational' }],
      });

      // Call $get-ws-binding-token
      const res3 = await request(app)
        .get(`/fhir/R4/Subscription/${createdSub.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res3.body).toMatchObject<OperationOutcome>({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'invalid' }],
      });
    }));

  test('should return OperationOutcome error if user does not have access to this Subscription', async () => {
    // Create subscription to watch patient
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

    const anotherUserToken = await initTestAuth();

    // Call $get-ws-binding-token
    const res2 = await request(app)
      .get(`/fhir/R4/Subscription/${createdSub.id}/$get-ws-binding-token`)
      .set('Authorization', 'Bearer ' + anotherUserToken);

    expect(res2.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid' }],
    });
  });

  test("should return OperationOutcome error if Project doesn't have `websocket-subscriptions` feature enabled", async () => {
    const anotherAccessToken = await initTestAuth();
    // Create subscription to watch patient
    const res1 = await request(app)
      .post(`/fhir/R4/Subscription`)
      .set('Authorization', 'Bearer ' + anotherAccessToken)
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

    const anotherUserToken = await initTestAuth();

    // Call $get-ws-binding-token
    const res2 = await request(app)
      .get(`/fhir/R4/Subscription/${createdSub.id}/$get-ws-binding-token`)
      .set('Authorization', 'Bearer ' + anotherUserToken);

    expect(res2.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid' }],
    });
  });
});
