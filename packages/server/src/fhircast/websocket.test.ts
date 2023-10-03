import { ContentType } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { Server } from 'http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { initTestAuth } from '../test.setup';

const app = express();
let config: MedplumServerConfig;
let server: Server;
let accessToken: string;

describe('FHIRCast WebSocket', () => {
  beforeAll(async () => {
    config = await loadTestConfig();
    server = await initApp(app, config);
    accessToken = await initTestAuth({}, { admin: true });

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Send message to subscriber', async () => {
    const topic = randomUUID();
    const patient = randomUUID();

    await request(server)
      .ws('/ws/fhircast/' + topic)
      .exec(async () => {
        const res = await request(server)
          .post(`/fhircast/STU2/${topic}`)
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            timestamp: new Date().toISOString(),
            id: randomUUID(),
            event: {
              'hub.topic': topic,
              'hub.event': 'patient-open',
              context: [
                {
                  key: 'patient',
                  resource: {
                    resourceType: 'Patient',
                    id: patient,
                  },
                },
              ],
            },
          });
        expect(res.status).toBe(201);
        expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
      })
      .expectJson((obj) => {
        expect(obj.event['hub.topic']).toBe(topic);
        expect(obj.event['hub.event']).toBe('patient-open');
      })
      .sendJson({ ok: true })
      .close()
      .expectClosed();
  });
});
