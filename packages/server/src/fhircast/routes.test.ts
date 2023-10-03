import { ContentType } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
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
    const res = await request(app).get('/fhircast/STU2/.well-known/fhircast-configuration');
    expect(res.status).toBe(200);
    expect(res.body.eventsSupported).toBeDefined();
    expect(res.body.websocketSupport).toBe(true);
    expect(res.body.webhookSupport).toBe(false);
    expect(res.body.fhircastVersion).toBe('STU2');
  });

  test('New subscription success', async () => {
    const res = await request(app)
      .post('/fhircast/STU2/')
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

  test('New subscription missing channel type', async () => {
    const res = await request(app)
      .post('/fhircast/STU2/')
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
      .post('/fhircast/STU2/')
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
      .post('/fhircast/STU2/')
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
      .post('/fhircast/STU2/' + topic)
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
    const res = await request(app).get('/fhircast/STU2/my-topic');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
