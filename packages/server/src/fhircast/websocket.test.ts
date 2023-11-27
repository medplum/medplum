import { ContentType } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { Server } from 'http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { MedplumServerConfig, loadTestConfig } from '../config';
import { initTestAuth } from '../test.setup';
import { cleanupHeartbeat, heartbeatTopics, waitForWebSocketsCleanup } from './websocket';

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
    let setTimeoutSpy: jest.SpyInstance;
    beforeAll(() => {
      jest.useFakeTimers();
      setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    });

    afterEach(() => {
      cleanupHeartbeat();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    test('Check that we get a heartbeat', async () => {
      const topic = randomUUID();
      await request(server)
        .ws('/ws/fhircast/' + topic)
        .expectJson((obj) => {
          // Connection verification message
          expect(obj['hub.topic']).toBe(topic);
        })
        .exec(() => jest.advanceTimersByTime(10001))
        .expectJson((obj) => {
          // Event message
          expect(obj.event['hub.topic']).toBe(topic);
          expect(obj.event['hub.event']).toBe('heartbeat');
        })
        .sendJson({ ok: true })
        .close()
        .expectClosed();
    });

    test('Check that timer are cleaned up after no topics active', async () => {
      const topic = randomUUID();
      await request(server)
        .ws('/ws/fhircast/' + topic)
        .expectJson((obj) => {
          // Connection verification message
          expect(obj['hub.topic']).toBe(topic);
        })
        .exec(() => jest.advanceTimersByTime(10001))
        .expectJson((obj) => {
          // Event message
          expect(obj.event['hub.topic']).toBe(topic);
          expect(obj.event['hub.event']).toBe('heartbeat');
        })
        .sendJson({ ok: true })
        .close()
        .expectClosed();

      await waitForWebSocketsCleanup();
      setTimeoutSpy.mockReset();
      jest.advanceTimersByTime(10001);
      expect(heartbeatTopics.size).toBe(0);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });
  });
});
