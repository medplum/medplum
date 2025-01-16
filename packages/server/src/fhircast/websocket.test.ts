import { ContentType, serializeFhircastSubscriptionRequest } from '@medplum/core';
import express, { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { globalLogger } from '../logger';
import { initTestAuth, withTestContext } from '../test.setup';

describe('FHIRcast WebSocket', () => {
  describe('Basic flow', () => {
    let app: Express;
    let config: MedplumServerConfig;
    let server: Server;
    let accessToken: string;

    beforeAll(async () => {
      console.log = jest.fn();
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

        const res1 = await request(server)
          .post('/fhircast/STU3')
          .set('Content-Type', ContentType.FORM_URL_ENCODED)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            serializeFhircastSubscriptionRequest({
              mode: 'subscribe',
              channelType: 'websocket',
              topic,
              events: ['Patient-open'],
            })
          );

        const endpoint = res1.body['hub.channel.endpoint'];
        expect(endpoint).not.toContain(`/ws/fhircast/${topic}`);

        const pathname = new URL(endpoint).pathname;

        await request(server)
          .ws(pathname)
          .expectJson((obj) => {
            // Connection verification message
            expect(obj['hub.topic']).toBe(topic);
          })
          .exec(async () => {
            const res2 = await request(server)
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
            expect(res2.status).toBe(201);
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');
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

    test('Invalid endpoint', () =>
      withTestContext(async () => {
        const globalLoggerErrorSpy = jest.spyOn(globalLogger, 'error');
        const topic = randomUUID();
        await request(server)
          .ws(`/ws/fhircast/${topic}`)
          .expectJson({
            'hub.mode': 'denied',
            'hub.topic': '',
            'hub.events': '',
            'hub.reason': 'invalid endpoint',
          })
          .exec(() => {
            expect(globalLoggerErrorSpy).toHaveBeenCalledWith(
              expect.stringMatching(/^\[FHIRcast\]: No topic associated with the endpoint '/)
            );
          })
          .expectClosed();
      }));
  });

  describe('Heartbeat', () => {
    let app: Express;
    let config: MedplumServerConfig;
    let server: Server;
    let accessToken: string;

    beforeAll(async () => {
      app = express();
      config = await loadTestConfig();
      config.heartbeatMilliseconds = 25;
      server = await initApp(app, config);
      accessToken = await initTestAuth({ membership: { admin: true } });
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

        const res1 = await request(server)
          .post('/fhircast/STU3')
          .set('Content-Type', ContentType.FORM_URL_ENCODED)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            serializeFhircastSubscriptionRequest({
              mode: 'subscribe',
              channelType: 'websocket',
              topic,
              events: ['Patient-open'],
            })
          );

        const endpoint = res1.body['hub.channel.endpoint'];
        expect(endpoint).not.toContain(`/ws/fhircast/${topic}`);

        const pathname = new URL(endpoint).pathname;

        await request(server)
          .ws(pathname)
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

        const res1 = await request(server)
          .post('/fhircast/STU3')
          .set('Content-Type', ContentType.FORM_URL_ENCODED)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            serializeFhircastSubscriptionRequest({
              mode: 'subscribe',
              channelType: 'websocket',
              topic,
              events: ['Patient-open'],
            })
          );

        const endpoint = res1.body['hub.channel.endpoint'];
        expect(endpoint).not.toContain(`/ws/fhircast/${topic}`);

        const pathname = new URL(endpoint).pathname;

        await request(server)
          .ws(pathname)
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
