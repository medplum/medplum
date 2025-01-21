import { ContentType, serializeFhircastSubscriptionRequest } from '@medplum/core';
import express, { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
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
      config.heartbeatMilliseconds = 100;
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
            expect(obj).toMatchObject({
              id: expect.any(String),
              timestamp: expect.any(String),
              event: {
                context: [{ key: 'period', decimal: '10' }],
                'hub.event': 'heartbeat',
              },
            });
          })
          .sendJson({ ok: true })
          .close()
          .expectClosed();
      }));

    test('Make sure that we only get one heartbeat per tick for a given topic', () =>
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
          .exec(async () => {
            // Now open up a second connection in order to test that we don't get duplicate heartbeats with multiple clients
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
              .exec(async (ws) => {
                await once(ws, 'message');
                // We check that the time between two heartbeats is greater than expected minimum time
                const startTime = Date.now();
                await once(ws, 'message');
                const endTime = Date.now();

                // setInterval doesn't guarantee a minimum time between executions, so we give a little leniency for the 100ms
                expect(endTime - startTime).toBeGreaterThanOrEqual(90);
              })
              // We're just expecting the two calls we already caught in the above exec
              .expectJson((obj) => {
                // Event message
                expect(obj.event['hub.topic']).toBe(topic);
                expect(obj.event['hub.event']).toBe('heartbeat');
              })
              .expectJson((obj) => {
                // Event message
                expect(obj.event['hub.topic']).toBe(topic);
                expect(obj.event['hub.event']).toBe('heartbeat');
              })
              .close()
              .expectClosed();
          })
          .sendJson({ ok: true })
          .close()
          .expectClosed();
      }));
  });
});
