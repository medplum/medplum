import { ContentType } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { Server } from 'http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { MedplumServerConfig, loadTestConfig } from '../config';
import { initTestAuth } from '../test.setup';
import { cleanupHeartbeatTimers } from './websocket';

const app = express();
let config: MedplumServerConfig;
let server: Server;
let accessToken: string;

describe('FHIRcast WebSocket', () => {
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

  describe('Basic flow', () => {
    test('Send message to subscriber', async () => {
      const topic = randomUUID();
      const patient = randomUUID();

      await request(server)
        .ws('/ws/fhircast/' + topic)
        .expectJson((obj) => {
          // Connection verification message
          expect(obj['hub.topic']).toBe(topic);
        })
        .exec(async () => {
          const res = await request(server)
            .post(`/fhircast/STU3/${topic}`)
            .set('Content-Type', ContentType.JSON)
            .set('Authorization', 'Bearer ' + accessToken)
            .send({
              timestamp: new Date().toISOString(),
              id: randomUUID(),
              event: {
                'hub.topic': topic,
                'hub.event': 'Patient-open',
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
          // Event message
          expect(obj.event['hub.topic']).toBe(topic);
          expect(obj.event['hub.event']).toBe('Patient-open');
        })
        .sendJson({ ok: true })
        .close()
        .expectClosed();
    });
  });

  describe('Heartbeat', () => {
    beforeAll(() => {
      jest.useFakeTimers();
      jest.spyOn(global, 'setTimeout');
    });

    afterEach(() => {
      cleanupHeartbeatTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    test('Check that we only get one heartbeat', async () => {
      const topic = randomUUID();
      await request(server)
        .ws('/ws/fhircast/' + topic)
        .expectJson((obj) => {
          // Connection verification message
          expect(obj['hub.topic']).toBe(topic);
        })
        .exec(() => jest.advanceTimersByTime(10001))
        // .exec(async () => {
        //   await request(server)
        //     .ws('/ws/fhircast/' + topic)
        //     .expectJson((obj) => {
        //       // Connection verification message
        //       expect(obj['hub.topic']).toBe(topic);
        //     })
        //     .expectJson((obj) => {
        //       expect(obj.event['hub.topic']).toBe(topic);
        //       expect(obj.event['hub.event']).toBe('heartbeat');
        //     })
        //     .sendJson({ ok: true });
        // })
        .expectJson((obj) => {
          // Event message
          expect(obj.event['hub.topic']).toBe(topic);
          expect(obj.event['hub.event']).toBe('heartbeat');
        })
        .sendJson({ ok: true })
        .close()
        .expectClosed();
    });
  });
});
