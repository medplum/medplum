import {
  ContentType,
  FhircastEventContext,
  FhircastEventPayload,
  createFhircastMessagePayload,
  generateId,
} from '@medplum/core';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { MedplumServerConfig, loadTestConfig } from '../config';
import { getRedis } from '../redis';
import { initTestAuth } from '../test.setup';

const STU2_BASE_ROUTE = '/fhircast/STU2/';
const STU3_BASE_ROUTE = '/fhircast/STU3/';

describe('FHIRCast routes', () => {
  let app: express.Express;
  let config: MedplumServerConfig;
  let server: Server;
  let accessToken: string;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    config.heartbeatEnabled = false;
    server = await initApp(app, config);
    accessToken = await initTestAuth({ membership: { admin: true } });
    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get well known', async () => {
    let res;

    res = await request(server).get(`${STU2_BASE_ROUTE}.well-known/fhircast-configuration`);

    expect(res.status).toBe(200);
    expect(res.body.eventsSupported).toBeDefined();
    expect(res.body.getCurrentSupport).toBeUndefined();
    expect(res.body.websocketSupport).toBe(true);
    expect(res.body.webhookSupport).toBe(false);
    expect(res.body.fhircastVersion).toBe('STU2');

    res = await request(server).get(`${STU3_BASE_ROUTE}.well-known/fhircast-configuration`);

    expect(res.status).toBe(200);
    expect(res.body.eventsSupported).toBeDefined();
    expect(res.body.getCurrentSupport).toBe(true);
    expect(res.body.websocketSupport).toBe(true);
    expect(res.body.webhookSupport).toBe(false);
    expect(res.body.fhircastVersion).toBe('STU3');
  });

  test('New subscription success', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          'hub.channel.type': 'websocket',
          'hub.mode': 'subscribe',
          'hub.topic': 'topic',
          'hub.events': 'Patient-open',
        });
      expect(res.status).toBe(202);
      expect(res.body['hub.channel.endpoint']).toBeDefined();
    }
  });

  test('New subscription no auth', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server).post(route).set('Content-Type', ContentType.JSON).send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });
      expect(res.status).toBe(401);
      expect(res.body.issue[0].details.text).toEqual('Unauthorized');
    }
  });

  test('New subscription missing channel type', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          'hub.mode': 'subscribe',
          'hub.topic': 'topic',
          'hub.events': 'Patient-open',
        });
      expect(res.status).toBe(400);
      expect(res.body.issue[0].details.text).toEqual('Missing hub.channel.type');
    }
  });

  test('New subscription invalid channel type', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          'hub.channel.type': 'xyz',
          'hub.mode': 'subscribe',
          'hub.topic': 'topic',
          'hub.events': 'Patient-open',
        });
      expect(res.status).toBe(400);
      expect(res.body.issue[0].details.text).toEqual('Invalid hub.channel.type');
    }
  });

  test('New subscription invalid mode', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          'hub.channel.type': 'websocket',
          'hub.mode': 'xyz',
          'hub.topic': 'topic',
          'hub.events': 'Patient-open',
        });
      expect(res.status).toBe(400);
      expect(res.body.issue[0].details.text).toEqual('Invalid hub.mode');
    }
  });

  test('Unsubscribe', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const subRes = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          'hub.channel.type': 'websocket',
          'hub.mode': 'subscribe',
          'hub.topic': 'topic',
          'hub.events': 'Patient-open',
        });
      expect(subRes.status).toBe(202);
      expect(subRes.body['hub.channel.endpoint']).toBeDefined();

      await request(server)
        .ws('/ws/fhircast/topic')
        .expectJson((obj) => {
          // Connection verification message
          expect(obj['hub.topic']).toBe('topic');
        })
        .exec(async () => {
          const unsubRes = await request(server)
            .post(route)
            .set('Content-Type', ContentType.JSON)
            .set('Authorization', 'Bearer ' + accessToken)
            .send({
              'hub.channel.type': 'websocket',
              'hub.mode': 'unsubscribe',
              'hub.topic': 'topic',
              'hub.events': 'Patient-open',
            });
          expect(unsubRes.status).toBe(202);
          expect(unsubRes.body['hub.channel.endpoint']).toBeDefined();
        })
        .expectJson({
          'hub.topic': 'topic',
          'hub.mode': 'denied',
          'hub.reason': 'Subscriber unsubscribed from topic',
          'hub.events': 'Patient-open',
        })
        .close()
        .expectClosed();
    }
  });

  test('Publish event missing timestamp', async () => {
    const topic = randomUUID();
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(route + topic)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          id: randomUUID(),
          event: {},
        });
      expect(res.status).toBe(400);
      expect(res.body.issue[0].details.text).toEqual('Missing event timestamp');
    }
  });

  test('Get context', async () => {
    const topic = randomUUID();
    let res;
    // Non-standard FHIRCast extension to support Nuance PowerCast Hub
    res = await request(server)
      .get(`${STU2_BASE_ROUTE}${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    res = await request(server)
      .get(`${STU3_BASE_ROUTE}${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ 'context.type': '', context: [] });
  });

  test('Get context after *-open event', async () => {
    let contextRes;

    const payload = createFhircastMessagePayload('my-topic', 'DiagnosticReport-open', [
      {
        key: 'report',
        resource: { id: 'def-456', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ]);
    const publishRes = await request(server)
      .post(`${STU3_BASE_ROUTE}my-topic`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(publishRes.status).toBe(201);

    contextRes = await request(server)
      .get(`${STU2_BASE_ROUTE}my-topic`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toEqual(payload.event.context);

    contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}my-topic`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toMatchObject({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: payload.event.context,
    });
  });

  test('Get context after *-close event', async () => {
    let beforeContextRes;
    let afterContextRes;

    const context = [
      {
        key: 'report',
        resource: { id: 'def-456', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ] satisfies FhircastEventContext<'DiagnosticReport-open'>[];

    const payload = createFhircastMessagePayload('my-topic', 'DiagnosticReport-open', context);
    payload.event['context.versionId'] = generateId();

    // Setup the key as if we have already opened this resource
    await getRedis().set('medplum:fhircast:topic:my-topic:latest', JSON.stringify(payload));

    beforeContextRes = await request(server)
      .get(`${STU2_BASE_ROUTE}my-topic`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(beforeContextRes.status).toBe(200);
    expect(beforeContextRes.body).toEqual(context);

    beforeContextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}my-topic`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(beforeContextRes.status).toBe(200);
    expect(beforeContextRes.body).toEqual({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context,
    });

    const publishRes = await request(server)
      .post(`${STU3_BASE_ROUTE}my-topic`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(createFhircastMessagePayload('my-topic', 'DiagnosticReport-close', context));
    expect(publishRes.status).toBe(201);

    afterContextRes = await request(server)
      .get(`${STU2_BASE_ROUTE}my-topic`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(afterContextRes.status).toBe(200);
    expect(afterContextRes.body).toEqual([]);

    afterContextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}my-topic`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(afterContextRes.status).toBe(200);
    expect(afterContextRes.body).toEqual({ 'context.type': '', context: [] });
  });

  test('Check for `context.versionId` on `DiagnosticReport-open`', async () => {
    const context = [
      {
        key: 'report',
        resource: { id: 'abc-123', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'study', resource: { id: 'def-456', resourceType: 'ImagingStudy', status: 'available', subject: {} } },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ] satisfies FhircastEventContext<'DiagnosticReport-open'>[];

    const payload = createFhircastMessagePayload('my-topic', 'DiagnosticReport-open', context);

    const publishRes = await request(server)
      .post(`${STU3_BASE_ROUTE}my-topic`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(publishRes.status).toBe(201);

    const latestEventStr = (await getRedis().get('medplum:fhircast:topic:my-topic:latest')) as string;
    expect(latestEventStr).toBeTruthy();
    const latestEvent = JSON.parse(latestEventStr) as FhircastEventPayload<'DiagnosticReport-open'>;
    expect(latestEvent).toMatchObject({
      ...payload,
      event: { ...payload.event, 'context.versionId': expect.any(String) },
    });
  });

  test('`DiagnosticReport-update`: `context.priorVersionId` matches prior `context.versionId`', async () => {
    const context = [
      {
        key: 'report',
        resource: { id: 'abc-123', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'updates', resource: { id: 'bundle-123', resourceType: 'Bundle', type: 'searchset' } },
    ] satisfies FhircastEventContext<'DiagnosticReport-update'>[];

    const versionId = randomUUID();
    const payload = createFhircastMessagePayload('my-topic', 'DiagnosticReport-update', context, versionId);

    const publishRes = await request(server)
      .post(`${STU3_BASE_ROUTE}my-topic`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(publishRes.status).toBe(201);

    const latestEventStr = (await getRedis().get('medplum:fhircast:topic:my-topic:latest')) as string;
    expect(latestEventStr).toBeTruthy();
    const latestEvent = JSON.parse(latestEventStr) as FhircastEventPayload<'DiagnosticReport-update'>;
    expect(latestEvent).toMatchObject({
      ...payload,
      event: {
        ...payload.event,
        'context.priorVersionId': versionId,
        'context.versionId': expect.any(String),
      },
    });
  });
});
