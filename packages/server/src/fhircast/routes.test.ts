import { ContentType, FhircastEventContext, FhircastEventPayload, createFhircastMessagePayload } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getRedis } from '../redis';
import { initTestAuth } from '../test.setup';

const app = express();
let accessToken: string;

describe('FHIRCast routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get well known', async () => {
    const res = await request(app).get('/fhircast/STU3/.well-known/fhircast-configuration');

    expect(res.status).toBe(200);
    expect(res.body.eventsSupported).toBeDefined();
    expect(res.body.getCurrentSupport).toBe(true);
    expect(res.body.websocketSupport).toBe(true);
    expect(res.body.webhookSupport).toBe(false);
    expect(res.body.fhircastVersion).toBe('STU3');
  });

  test('New subscription success', async () => {
    const res = await request(app)
      .post('/fhircast/STU3/')
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'patient-open',
      });
    expect(res.status).toBe(202);
    expect(res.body['hub.channel.endpoint']).toBeDefined();
  });

  test('New subscription no auth', async () => {
    const res = await request(app).post('/fhircast/STU3/').set('Content-Type', ContentType.JSON).send({
      'hub.channel.type': 'websocket',
      'hub.mode': 'subscribe',
      'hub.topic': 'topic',
      'hub.events': 'patient-open',
    });
    expect(res.status).toBe(401);
    expect(res.body.issue[0].details.text).toEqual('Unauthorized');
  });

  test('New subscription missing channel type', async () => {
    const res = await request(app)
      .post('/fhircast/STU3/')
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'patient-open',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Missing hub.channel.type');
  });

  test('New subscription invalid channel type', async () => {
    const res = await request(app)
      .post('/fhircast/STU3/')
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'xyz',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'patient-open',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Invalid hub.channel.type');
  });

  test('New subscription invalid mode', async () => {
    const res = await request(app)
      .post('/fhircast/STU3/')
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'xyz',
        'hub.topic': 'topic',
        'hub.events': 'patient-open',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Invalid hub.mode');
  });

  test('Publish event missing timestamp', async () => {
    const topic = randomUUID();
    const res = await request(app)
      .post('/fhircast/STU3/' + topic)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        id: randomUUID(),
        event: {},
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Missing event timestamp');
  });

  test('Get context', async () => {
    // Get the current subscription status
    // Non-standard FHIRCast extension to support Nuance PowerCast Hub
    const res = await request(app)
      .get('/fhircast/STU3/my-topic')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('Get context after *-open event', async () => {
    const payload = createFhircastMessagePayload('my-topic', 'imagingstudy-open', [
      { key: 'study', resource: { id: 'def-456', resourceType: 'ImagingStudy' } },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ]);
    const publishRes = await request(app)
      .post('/fhircast/STU3/my-topic')
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(publishRes.status).toBe(201);

    const contextRes = await request(app)
      .get('/fhircast/STU3/my-topic')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toEqual(payload.event.context);
  });

  test('Get context after *-close event', async () => {
    const context = [
      { key: 'study', resource: { id: 'def-456', resourceType: 'ImagingStudy' } },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ] as FhircastEventContext<'imagingstudy-open'>[];

    const payload = createFhircastMessagePayload('my-topic', 'imagingstudy-open', context);
    // Setup the key as if we have already opened this resource
    await getRedis().set('::fhircast::my-topic::latest::', JSON.stringify(payload));

    const beforeContextRes = await request(app)
      .get('/fhircast/STU3/my-topic')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(beforeContextRes.status).toBe(200);
    expect(beforeContextRes.body).toEqual(context);

    const publishRes = await request(app)
      .post('/fhircast/STU3/my-topic')
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(createFhircastMessagePayload('my-topic', 'imagingstudy-close', context));
    expect(publishRes.status).toBe(201);

    const afterContextRes = await request(app)
      .get('/fhircast/STU3/my-topic')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(afterContextRes.status).toBe(200);
    expect(afterContextRes.body).toEqual([]);
  });

  test('Check for `context.versionId` on `DiagnosticReport-open`', async () => {
    const context = [
      { key: 'report', resource: { id: 'abc-123', resourceType: 'DiagnosticReport' } },
      { key: 'study', resource: { id: 'def-456', resourceType: 'ImagingStudy' } },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ] as FhircastEventContext<'diagnosticreport-open'>[];

    const payload = createFhircastMessagePayload('my-topic', 'diagnosticreport-open', context);

    const publishRes = await request(app)
      .post('/fhircast/STU3/my-topic')
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(publishRes.status).toBe(201);

    const latestEventStr = (await getRedis().get('::fhircast::my-topic::latest::')) as string;
    expect(latestEventStr).toBeTruthy();
    const latestEvent = JSON.parse(latestEventStr) as FhircastEventPayload<'diagnosticreport-open'>;
    expect(latestEvent).toMatchObject({
      ...payload,
      event: { ...payload.event, 'context.versionId': expect.any(String) },
    });
  });
});
