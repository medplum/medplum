import { ContentType } from '@medplum/core';
import { randomUUID } from 'crypto';
import express, { Express } from 'express';
import { Server } from 'http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { MedplumServerConfig, loadTestConfig } from '../config';
import { initTestAuth, withTestContext } from '../test.setup';

describe('FHIRcast WebSocket', () => {
  describe('Basic flow', () => {
    let app: Express;
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

    test('Send message to subscriber', () =>
      withTestContext(async () => {
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
      }));
  });

  describe('Heartbeat', () => {
    let app: Express;
    let config: MedplumServerConfig;
    let server: Server;

    beforeAll(async () => {
      app = express();
      config = await loadTestConfig();
      config.heartbeatMilliseconds = 25;
      server = await initApp(app, config);
      await new Promise<void>((resolve) => {
        server.listen(0, 'localhost', 511, resolve);
      });
    });

    afterAll(async () => {
      await shutdownApp();
    });

    test('Check that we get a heartbeat', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        await request(server)
          .ws('/ws/fhircast/' + topic)
          .expectJson((obj) => {
            // Connection verification message
            expect(obj['hub.topic']).toBe(topic);
          })
          .expectJson((obj) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('heartbeat');
          })
          .sendJson({ ok: true })
          .close()
          .expectClosed();
      }));

    test('Check that timer and promises are cleaned up after no topics active', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        await request(server)
          .ws('/ws/fhircast/' + topic)
          .expectJson((obj) => {
            // Connection verification message
            expect(obj['hub.topic']).toBe(topic);
          })
          .expectJson((obj) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('heartbeat');
          })
          .sendJson({ ok: true })
          .close()
          .expectClosed();
      }));
  });
});
