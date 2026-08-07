// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CurrentContext, FhircastEventContext, FhircastEventPayload, WithId } from '@medplum/core';
import { ContentType, createFhircastMessagePayload, generateId, isOperationOutcome } from '@medplum/core';
import type { DiagnosticReport, Project } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'superwstest';
import { vi } from 'vitest';
import type { RawData } from 'ws';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { getCacheRedis } from '../redis';
import { createTestProject, withTestContext } from '../test.setup';
import type { EventCategory } from './routes';
import { getEventCategory } from './routes';
import { extractEndpoint, getEndpointSubscription, setTopicCurrentContext } from './utils';

const STU2_BASE_ROUTE = '/fhircast/STU2';
const STU3_BASE_ROUTE = '/fhircast/STU3';
const HUB_ALIAS_ROUTE = '/api/hub';

describe('FHIRcast routes', () => {
  let app: express.Express;
  let config: MedplumServerConfig;
  let server: Server;
  let project: WithId<Project>;
  let accessToken: string;
  let tokenForAnotherProject: string;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    config.heartbeatEnabled = false;
    server = await initApp(app, config);

    const { accessToken: _accessToken1, project: _project1 } = await withTestContext(() =>
      createTestProject({ membership: { admin: true }, withAccessToken: true })
    );
    const { accessToken: _accessToken2 } = await withTestContext(() =>
      createTestProject({ membership: { admin: true }, withAccessToken: true })
    );

    accessToken = _accessToken1;
    project = _project1;
    tokenForAnotherProject = _accessToken2;

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 8517, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get well known', async () => {
    let res: any;

    res = await request(server).get(`${STU2_BASE_ROUTE}/.well-known/fhircast-configuration`);

    expect(res).toHaveStatus(200);
    expect(res.body.eventsSupported).toBeDefined();
    expect(res.body.getCurrentSupport).toBeUndefined();
    expect(res.body.websocketSupport).toBe(true);
    expect(res.body.webhookSupport).toBe(false);
    expect(res.body.fhircastVersion).toBe('STU2');

    res = await request(server).get(`${STU3_BASE_ROUTE}/.well-known/fhircast-configuration`);

    expect(res).toHaveStatus(200);
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
      expect(res).toHaveStatus(202);
      expect(res.body['hub.channel.endpoint']).toBeDefined();
    }
  });

  test('New subscription with url-encoded body', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE, HUB_ALIAS_ROUTE]) {
      const res = await request(server)
        .post(route)
        .set('Content-Type', ContentType.FORM_URL_ENCODED)
        .set('Authorization', 'Bearer ' + accessToken)
        .send(
          new URLSearchParams({
            'hub.channel.type': 'websocket',
            'hub.mode': 'subscribe',
            'hub.topic': 'topic',
            'hub.events': 'Patient-open,Patient-close',
          }).toString()
        );
      expect(res).toHaveStatus(202);
      expect(res.body['hub.channel.endpoint']).toBeDefined();
    }
  });

  test('Hub alias serves the STU3 router', async () => {
    const wellKnown = await request(server).get(`${HUB_ALIAS_ROUTE}/.well-known/fhircast-configuration`);
    expect(wellKnown).toHaveStatus(200);
    expect(wellKnown.body.fhircastVersion).toBe('STU3');

    const subscribe = await request(server)
      .post(HUB_ALIAS_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'alias-topic',
        'hub.events': 'Patient-open',
      });
    expect(subscribe).toHaveStatus(202);
    expect(subscribe.body['hub.channel.endpoint']).toMatch(/ws:\/\/localhost:8103\/ws\/fhircast\/*/);

    // STU3 shape for an empty current context, rather than the STU2 empty array
    const currentContext = await request(server)
      .get(`${HUB_ALIAS_ROUTE}/alias-topic`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(currentContext).toHaveStatus(200);
    expect(currentContext.body).toStrictEqual({ 'context.type': '', context: [] });
  });

  test('New subscription no auth', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server).post(route).set('Content-Type', ContentType.JSON).send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });
      expect(res).toHaveStatus(401);
      expect(res.body.issue[0].details.text).toStrictEqual('Unauthorized');
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
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Missing hub.channel.type');
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
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Invalid hub.channel.type');
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
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Invalid hub.mode');
    }
  });

  test('New subscription naming no events', async () => {
    // `notEmpty()` does not trim, so these reach the handler and parse to an empty list
    for (const events of [' ', ',', ' , ']) {
      const res = await request(server)
        .post(STU3_BASE_ROUTE)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          'hub.channel.type': 'websocket',
          'hub.mode': 'subscribe',
          'hub.topic': 'topic',
          'hub.events': events,
        });
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Invalid hub.events');
    }
  });

  test('Each subscription to a topic yields its own endpoint and remembers its events', async () => {
    const topic = randomUUID();
    const subscribe = async (events: string): Promise<string> => {
      const res = await request(server)
        .post(STU3_BASE_ROUTE)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          'hub.channel.type': 'websocket',
          'hub.mode': 'subscribe',
          'hub.topic': topic,
          'hub.events': events,
        });
      expect(res).toHaveStatus(202);
      expect(res.body['hub.channel.endpoint']).toMatch(/ws:\/\/localhost:8103\/ws\/fhircast\/*/);
      expect(res.body['hub.channel.endpoint']).not.toContain(topic);
      return res.body['hub.channel.endpoint'];
    };

    const endpoint1 = await subscribe('Patient-open');
    const endpoint2 = await subscribe('ImagingStudy-open,ImagingStudy-close');
    expect(endpoint2).not.toStrictEqual(endpoint1);

    await expect(getEndpointSubscription(extractEndpoint(endpoint1) as string)).resolves.toStrictEqual({
      projectId: project.id,
      topic,
      events: ['Patient-open'],
      version: 'STU3',
    });
    await expect(getEndpointSubscription(extractEndpoint(endpoint2) as string)).resolves.toStrictEqual({
      projectId: project.id,
      topic,
      events: ['ImagingStudy-open', 'ImagingStudy-close'],
      version: 'STU3',
    });
  });

  test('Whitespace around `hub.events` is not tracked as part of the event name', async () => {
    const topic = randomUUID();
    const res = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': topic,
        'hub.events': 'Patient-open, Patient-close',
      });
    expect(res).toHaveStatus(202);

    const endpoint = extractEndpoint(res.body['hub.channel.endpoint']) as string;
    await expect(getEndpointSubscription(endpoint)).resolves.toMatchObject({
      events: ['Patient-open', 'Patient-close'],
    });
  });

  test('Redis fails to store the subscription', async () => {
    const redisSet = vi
      .spyOn(getCacheRedis(), 'set')
      .mockRejectedValue(new Error('Something happened when querying Redis'));

    const res = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });

    expect(res).toHaveStatus(500);
    expect(isOperationOutcome(res.body)).toStrictEqual(true);
    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          details: { text: 'Internal server error' },
          diagnostics: 'Error: Failed to create subscription for topic',
        },
      ],
    });

    redisSet.mockRestore();
  });

  test('Unsubscribe', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const topic = randomUUID();
      const subRes = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          'hub.channel.type': 'websocket',
          'hub.mode': 'subscribe',
          'hub.topic': topic,
          'hub.events': 'Patient-open',
        });
      expect(subRes).toHaveStatus(202);
      const endpointUrl = subRes.body['hub.channel.endpoint'];
      expect(endpointUrl).toBeDefined();

      await request(server)
        .ws(new URL(endpointUrl).pathname)
        .expectJson((obj) => {
          // Connection verification message
          expect(obj['hub.topic']).toBe(topic);
        })
        .exec(async () => {
          const unsubRes = await request(server)
            .post(route)
            .set('Content-Type', ContentType.JSON)
            .set('Authorization', 'Bearer ' + accessToken)
            .send({
              'hub.channel.type': 'websocket',
              'hub.mode': 'unsubscribe',
              'hub.topic': topic,
              'hub.events': 'Patient-open',
              endpoint: endpointUrl,
            });
          expect(unsubRes).toHaveStatus(202);
          expect(unsubRes.body['hub.channel.endpoint']).toStrictEqual(endpointUrl);
        })
        .expectJson({
          'hub.topic': topic,
          'hub.mode': 'denied',
          'hub.reason': 'Subscriber unsubscribed from topic',
          'hub.events': 'Patient-open',
        })
        // The Hub closes the socket behind the denial, so the subscriber does not have to
        .expectClosed();

      // The subscription record is gone, so a reconnect to this endpoint would be denied
      await expect(getEndpointSubscription(extractEndpoint(endpointUrl) as string)).resolves.toBeUndefined();
    }
  });

  test('Unsubscribe without an endpoint is rejected', async () => {
    const topic = randomUUID();
    const subRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': topic,
        'hub.events': 'Patient-open',
      });
    expect(subRes).toHaveStatus(202);

    await request(server)
      .ws(new URL(subRes.body['hub.channel.endpoint']).pathname)
      .expectJson((obj) => {
        expect(obj['hub.mode']).toBe('subscribe');
      })
      .exec(async () => {
        const unsubRes = await request(server)
          .post(STU3_BASE_ROUTE)
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            'hub.channel.type': 'websocket',
            'hub.mode': 'unsubscribe',
            'hub.topic': topic,
            'hub.events': 'Patient-open',
          });
        expect(unsubRes).toHaveStatus(400);
        expect(unsubRes.body.issue[0].details.text).toStrictEqual('Missing endpoint');

        await request(server)
          .post(`${STU3_BASE_ROUTE}/${topic}`)
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            createFhircastMessagePayload(topic, 'Patient-open', [
              { key: 'patient', resource: { resourceType: 'Patient', id: generateId() } },
            ])
          );
      })
      // An unsubscribe the Hub cannot address denies no one, so this subscriber hears the next event
      .expectJson((obj) => {
        expect(obj.event['hub.event']).toBe('Patient-open');
      })
      .close()
      .expectClosed();
  });

  test('Unsubscribe with an unknown endpoint is rejected', async () => {
    const unsubRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'unsubscribe',
        'hub.topic': randomUUID(),
        'hub.events': 'Patient-open',
        endpoint: `ws://localhost:8103/ws/fhircast/${randomUUID()}`,
      });
    expect(unsubRes).toHaveStatus(400);
    expect(unsubRes.body.issue[0].details.text).toStrictEqual('Invalid endpoint');
  });

  test('Unsubscribe leaves the topic`s other subscribers connected', async () => {
    const topic = randomUUID();
    const subscribe = async (): Promise<string> => {
      const res = await request(server)
        .post(STU3_BASE_ROUTE)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          'hub.channel.type': 'websocket',
          'hub.mode': 'subscribe',
          'hub.topic': topic,
          'hub.events': 'Patient-open',
        });
      expect(res).toHaveStatus(202);
      return res.body['hub.channel.endpoint'];
    };

    const endpointToKeep = await subscribe();
    const endpointToCancel = await subscribe();
    const afterDenial: string[] = [];

    await request(server)
      .ws(new URL(endpointToKeep).pathname)
      .expectJson((obj) => {
        expect(obj['hub.mode']).toBe('subscribe');
      })
      .exec(async () => {
        await request(server)
          .ws(new URL(endpointToCancel).pathname)
          .expectJson((obj) => {
            expect(obj['hub.mode']).toBe('subscribe');
          })
          .exec(async () => {
            const unsubRes = await request(server)
              .post(STU3_BASE_ROUTE)
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                'hub.channel.type': 'websocket',
                'hub.mode': 'unsubscribe',
                'hub.topic': topic,
                'hub.events': 'Patient-open',
                endpoint: endpointToCancel,
              });
            expect(unsubRes).toHaveStatus(202);
          })
          .expectJson((obj) => {
            expect(obj['hub.mode']).toBe('denied');
          })
          .exec(async (ws) => {
            ws.on('message', (data: RawData) => afterDenial.push((data as Buffer).toString('utf8')));
            await request(server)
              .post(`${STU3_BASE_ROUTE}/${topic}`)
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send(
                createFhircastMessagePayload(topic, 'Patient-open', [
                  { key: 'patient', resource: { resourceType: 'Patient', id: generateId() } },
                ])
              );
          })
          // The Hub closed this socket behind the denial, without the subscriber asking it to
          .expectClosed();
      })
      // The denial went to the other subscriber, so the next thing this one hears is the event
      .expectJson((obj) => {
        expect(obj.event['hub.event']).toBe('Patient-open');
      })
      .close()
      .expectClosed();

    // The cancelled subscriber heard nothing after its denial, though the topic went on publishing
    expect(afterDenial).toStrictEqual([]);
  });

  test('Unsubscribe cannot cancel a subscription from another project', async () => {
    const topic = randomUUID();
    const subRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': topic,
        'hub.events': 'Patient-open',
      });
    expect(subRes).toHaveStatus(202);
    const endpointUrl = subRes.body['hub.channel.endpoint'];

    await request(server)
      .ws(new URL(endpointUrl).pathname)
      .expectJson((obj) => {
        expect(obj['hub.mode']).toBe('subscribe');
      })
      .exec(async () => {
        const unsubRes = await request(server)
          .post(STU3_BASE_ROUTE)
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + tokenForAnotherProject)
          .send({
            'hub.channel.type': 'websocket',
            'hub.mode': 'unsubscribe',
            'hub.topic': topic,
            'hub.events': 'Patient-open',
            endpoint: endpointUrl,
          });
        expect(unsubRes).toHaveStatus(400);
        expect(unsubRes.body.issue[0].details.text).toStrictEqual('Invalid endpoint');

        await request(server)
          .post(`${STU3_BASE_ROUTE}/${topic}`)
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            createFhircastMessagePayload(topic, 'Patient-open', [
              { key: 'patient', resource: { resourceType: 'Patient', id: generateId() } },
            ])
          );
      })
      // The other project owns nothing here, so the subscriber is left connected
      .expectJson((obj) => {
        expect(obj.event['hub.event']).toBe('Patient-open');
      })
      .close()
      .expectClosed();

    await expect(getEndpointSubscription(extractEndpoint(endpointUrl) as string)).resolves.toMatchObject({
      projectId: project.id,
      topic,
    });
  });

  test('Publish event missing timestamp', async () => {
    const topic = randomUUID();
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(`${route}/${topic}`)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          id: randomUUID(),
          event: {},
        });
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Missing event timestamp');
    }
  });

  test('Context change request on hub.url', async () => {
    const topic = randomUUID();
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          event: {
            'hub.topic': topic,
            'hub.event': 'Patient-close',
            context: [
              {
                key: 'patient',
                resource: {
                  resourceType: 'Patient',
                  id: '798E4MyMcpCWHab9',
                  identifier: [
                    {
                      type: {
                        coding: [
                          {
                            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                            value: 'MR',
                            display: 'Medical Record Number',
                          },
                        ],
                        text: 'MRN',
                      },
                    },
                  ],
                },
              },
            ],
          },
        });
      expect(res).toHaveStatus(202);
    }
  });

  test('Context change request on /:topic', async () => {
    const topic = randomUUID();
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(`${route}/${topic}`)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          event: {
            'hub.topic': topic,
            'hub.event': 'Patient-close',
            context: [
              {
                key: 'patient',
                resource: {
                  resourceType: 'Patient',
                  id: '798E4MyMcpCWHab9',
                  identifier: [
                    {
                      type: {
                        coding: [
                          {
                            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                            value: 'MR',
                            display: 'Medical Record Number',
                          },
                        ],
                        text: 'MRN',
                      },
                    },
                  ],
                },
              },
            ],
          },
        });
      expect(res).toHaveStatus(202);
    }
  });

  test('Context change -- missing "hub.topic"', async () => {
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          event: {
            'hub.event': 'Patient-close',
            context: [
              {
                key: 'patient',
                resource: {
                  resourceType: 'Patient',
                  id: '798E4MyMcpCWHab9',
                  identifier: [
                    {
                      type: {
                        coding: [
                          {
                            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                            value: 'MR',
                            display: 'Medical Record Number',
                          },
                        ],
                        text: 'MRN',
                      },
                    },
                  ],
                },
              },
            ],
          },
        });
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Missing event["hub.topic"]');
    }
  });

  test('Context change -- missing "hub.event"', async () => {
    const topic = randomUUID();
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          event: {
            'hub.topic': topic,
            context: [
              {
                key: 'patient',
                resource: {
                  resourceType: 'Patient',
                  id: '798E4MyMcpCWHab9',
                  identifier: [
                    {
                      type: {
                        coding: [
                          {
                            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                            value: 'MR',
                            display: 'Medical Record Number',
                          },
                        ],
                        text: 'MRN',
                      },
                    },
                  ],
                },
              },
            ],
          },
        });
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Missing event["hub.event"]');
    }
  });

  test('Context change -- missing context', async () => {
    const topic = randomUUID();
    for (const route of [STU2_BASE_ROUTE, STU3_BASE_ROUTE]) {
      const res = await request(server)
        .post(route)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          event: {
            'hub.topic': topic,
            'hub.event': 'Patient-close',
          },
        });
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Missing event.context');
    }
  });

  test('Get context', async () => {
    const topic = randomUUID();
    let res: any;
    // Non-standard FHIRcast extension to support Nuance PowerCast Hub
    res = await request(server)
      .get(`${STU2_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    expect(res.body).toStrictEqual([]);

    res = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    expect(res.body).toStrictEqual({ 'context.type': '', context: [] });
  });

  test('Get context after *-open event', async () => {
    let contextRes: any;

    const topic = randomUUID();
    const payload = createFhircastMessagePayload(topic, 'DiagnosticReport-open', [
      {
        key: 'report',
        resource: { id: 'def-456', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ]);
    const publishRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(publishRes).toHaveStatus(202);

    contextRes = await request(server)
      .get(`${STU2_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes).toHaveStatus(200);
    expect(contextRes.body).toStrictEqual([
      ...payload.event.context,
      { key: 'content', resource: { id: expect.any(String), resourceType: 'Bundle', type: 'collection' } },
    ]);

    contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes).toHaveStatus(200);
    expect(contextRes.body).toMatchObject({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: [
        ...payload.event.context,
        { key: 'content', resource: { id: expect.any(String), resourceType: 'Bundle', type: 'collection' } },
      ],
    });
  });

  test('Get context cannot read from cross-project topic', async () => {
    const topic = randomUUID();

    const payload1 = createFhircastMessagePayload(topic, 'DiagnosticReport-open', [
      {
        key: 'report',
        resource: { id: 'def-456', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ]);

    const payload2 = createFhircastMessagePayload(topic, 'DiagnosticReport-open', [
      {
        key: 'report',
        resource: { id: 'abc-123', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'patient', resource: { id: 'def-456', resourceType: 'Patient' } },
    ]);

    let publishRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload1);
    expect(publishRes).toHaveStatus(202);

    let contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes).toHaveStatus(200);
    expect(contextRes.body).toMatchObject({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: [
        ...payload1.event.context,
        { key: 'content', resource: { id: expect.any(String), resourceType: 'Bundle', type: 'collection' } },
      ],
    });

    // Users from other projects should not be able to see the context from the original project
    contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + tokenForAnotherProject);
    expect(contextRes).toHaveStatus(200);
    expect(contextRes.body).toMatchObject({ 'context.type': '', context: [] });

    // Now set publish another event for the same topic in another project
    publishRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + tokenForAnotherProject)
      .send(payload2);
    expect(publishRes).toHaveStatus(202);

    // Context for project 1 should still be the same as before
    contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes).toHaveStatus(200);
    expect(contextRes.body).toMatchObject({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: [
        ...payload1.event.context,
        { key: 'content', resource: { id: expect.any(String), resourceType: 'Bundle', type: 'collection' } },
      ],
    });

    // Context for project 2 should not be the same as the last published event
    contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + tokenForAnotherProject);
    expect(contextRes).toHaveStatus(200);
    expect(contextRes.body).toMatchObject({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: [
        ...payload2.event.context,
        { key: 'content', resource: { id: expect.any(String), resourceType: 'Bundle', type: 'collection' } },
      ],
    });
  });

  test('Get context after *-close event', async () => {
    let beforeContextRes: any;
    let afterContextRes: any;

    const topic = randomUUID();

    const context = [
      {
        key: 'report',
        resource: { id: 'def-456', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ] satisfies FhircastEventContext<'DiagnosticReport-open'>[];

    const payload = createFhircastMessagePayload(topic, 'DiagnosticReport-open', context);
    payload.event['context.versionId'] = generateId();

    const contentBundleId = generateId();

    // Setup the key as if we have already opened this resource
    await setTopicCurrentContext(project.id, topic, {
      'context.type': 'DiagnosticReport',
      'context.versionId': generateId(),
      context: [
        ...context,
        { key: 'content', resource: { id: contentBundleId, resourceType: 'Bundle', type: 'collection' } },
      ],
    });

    beforeContextRes = await request(server)
      .get(`${STU2_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(beforeContextRes).toHaveStatus(200);
    expect(beforeContextRes.body).toStrictEqual([
      ...context,
      { key: 'content', resource: { id: contentBundleId, resourceType: 'Bundle', type: 'collection' } },
    ]);

    beforeContextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(beforeContextRes).toHaveStatus(200);
    expect(beforeContextRes.body).toStrictEqual({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: [
        ...context,
        { key: 'content', resource: { id: contentBundleId, resourceType: 'Bundle', type: 'collection' } },
      ],
    });

    const publishRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(createFhircastMessagePayload(topic, 'DiagnosticReport-close', context));
    expect(publishRes).toHaveStatus(202);

    afterContextRes = await request(server)
      .get(`${STU2_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(afterContextRes).toHaveStatus(200);
    expect(afterContextRes.body).toStrictEqual([]);

    afterContextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(afterContextRes).toHaveStatus(200);
    expect(afterContextRes.body).toStrictEqual({ 'context.type': '', context: [] });
  });

  test('Check for `context.versionId` on `DiagnosticReport-open`', async () => {
    const topic = randomUUID();

    const context = [
      {
        key: 'report',
        resource: { id: 'abc-123', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'study', resource: { id: 'def-456', resourceType: 'ImagingStudy', status: 'available', subject: {} } },
      { key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } },
    ] satisfies FhircastEventContext<'DiagnosticReport-open'>[];

    const payload = createFhircastMessagePayload(topic, 'DiagnosticReport-open', context);

    const publishRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(publishRes).toHaveStatus(202);
    expect(publishRes.body.event?.event?.['context.versionId']).toBeDefined();

    const latestContextStr = (await getCacheRedis().get(
      `medplum:fhircast:project:${project.id}:topic:${topic}:latest`
    )) as string;
    expect(latestContextStr).toBeTruthy();
    const latestContext = JSON.parse(latestContextStr) as CurrentContext<'DiagnosticReport'>;
    expect(publishRes.body.event?.event?.['context.versionId']).toStrictEqual(latestContext['context.versionId']);
  });

  test('`DiagnosticReport-update`: `context.priorVersionId` matches prior `context.versionId`', async () => {
    const topic = randomUUID();
    const contentBundleId = generateId();
    const versionId = generateId();

    // Setup the key as if we have already opened this resource
    await setTopicCurrentContext(project.id, topic, {
      'context.type': 'DiagnosticReport',
      'context.versionId': versionId,
      context: [
        {
          key: 'report',
          resource: {
            id: '123',
            resourceType: 'DiagnosticReport',
            status: 'preliminary',
            code: {
              coding: [
                {
                  system: 'http://loinc.org',
                  code: '19005-8',
                  display: 'Radiology Imaging study [Impression] (narrative)',
                },
              ],
            },
          } satisfies DiagnosticReport,
        },
        { key: 'content', resource: { id: contentBundleId, resourceType: 'Bundle', type: 'collection' } },
      ],
    });

    const context = [
      {
        key: 'report',
        reference: { reference: 'DiagnosticReport/123' },
      },
      {
        key: 'patient',
        reference: { reference: 'Patient/123' },
      },
      { key: 'updates', resource: { id: 'bundle-123', resourceType: 'Bundle', type: 'transaction' } },
    ] satisfies FhircastEventContext<'DiagnosticReport-update'>[];

    const payload = createFhircastMessagePayload(topic, 'DiagnosticReport-update', context, versionId);

    const publishRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(publishRes).toHaveStatus(202);
    expect(publishRes.body.event).toMatchObject({
      ...payload,
      event: {
        ...payload.event,
        'context.priorVersionId': payload.event['context.versionId'],
        'context.versionId': expect.any(String),
      },
    });

    expect(
      (publishRes.body.event.event as FhircastEventPayload<'DiagnosticReport-update'>)['context.priorVersionId']
    ).toStrictEqual(versionId);
  });

  test('`DiagnosticReport-update` returns 400 when current context is not a DiagnosticReport', async () => {
    const topic = randomUUID();
    const versionId = generateId();

    // Setup a Patient context (no content bundle)
    await setTopicCurrentContext(project.id, topic, {
      'context.type': 'Patient',
      'context.versionId': versionId,
      context: [{ key: 'patient', resource: { id: 'xyz-789', resourceType: 'Patient' } }],
    });

    const context = [
      { key: 'report', reference: { reference: 'DiagnosticReport/123' } },
      { key: 'patient', reference: { reference: 'Patient/xyz-789' } },
      { key: 'updates', resource: { id: 'bundle-123', resourceType: 'Bundle', type: 'transaction' } },
    ] satisfies FhircastEventContext<'DiagnosticReport-update'>[];

    const payload = createFhircastMessagePayload(topic, 'DiagnosticReport-update', context, versionId);

    const res = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', details: { text: 'No DiagnosticReport currently open for this topic' } }],
    });
  });
});

describe('getEventCategory', () => {
  test.each<[string, EventCategory]>([
    ['DiagnosticReport-open', 'open'],
    ['Patient-open', 'open'],
    ['Encounter-open', 'open'],
    ['ImagingStudy-open', 'open'],
    ['DiagnosticReport-close', 'close'],
    ['Patient-close', 'close'],
    ['Encounter-close', 'close'],
    ['ImagingStudy-close', 'close'],
    ['DiagnosticReport-update', 'update'],
    ['DiagnosticReport-select', 'select'],
    ['Patient-select', 'select'],
    // `Home-open` carries no anchor resource, so it must not be treated like the other `-open` events
    ['Home-open', 'other'],
    ['syncerror', 'other'],
    ['userlogout', 'other'],
    ['userhibernate', 'other'],
    ['heartbeat', 'other'],
    // Event names are matched case-insensitively
    ['PATIENT-OPEN', 'open'],
    ['home-OPEN', 'other'],
    ['diagnosticreport-UPDATE', 'update'],
  ])('%s -> %s', (eventName, expected) => {
    expect(getEventCategory(eventName)).toStrictEqual(expected);
  });
});
