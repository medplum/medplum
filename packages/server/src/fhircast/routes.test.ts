import {
  ContentType,
  FhircastEventContext,
  FhircastEventPayload,
  createFhircastMessagePayload,
  generateId,
  isOperationOutcome,
} from '@medplum/core';
import { Project } from '@medplum/fhirtypes';
import express from 'express';
import { ChainableCommander } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { MedplumServerConfig, loadTestConfig } from '../config';
import { getRedis } from '../redis';
import { createTestProject, withTestContext } from '../test.setup';

const STU2_BASE_ROUTE = '/fhircast/STU2';
const STU3_BASE_ROUTE = '/fhircast/STU3';

type ExecResult = Awaited<ReturnType<ChainableCommander['exec']>>;

class MockChainableCommander {
  result: ExecResult = null;
  setnx(): this {
    return this;
  }
  get(): this {
    return this;
  }
  async exec(): Promise<[Error | null, unknown][] | null> {
    return this.result;
  }
  setNextExecResult(result: ExecResult): void {
    this.result = result;
  }
}

describe('FHIRCast routes', () => {
  let app: express.Express;
  let config: MedplumServerConfig;
  let server: Server;
  let project: Project;
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
      server.listen(0, 'localhost', 511, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get well known', async () => {
    let res;

    res = await request(server).get(`${STU2_BASE_ROUTE}/.well-known/fhircast-configuration`);

    expect(res.status).toBe(200);
    expect(res.body.eventsSupported).toBeDefined();
    expect(res.body.getCurrentSupport).toBeUndefined();
    expect(res.body.websocketSupport).toBe(true);
    expect(res.body.webhookSupport).toBe(false);
    expect(res.body.fhircastVersion).toBe('STU2');

    res = await request(server).get(`${STU3_BASE_ROUTE}/.well-known/fhircast-configuration`);

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
      expect(res.status).toBe(400);
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
      expect(res.status).toBe(400);
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
      expect(res.status).toBe(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Invalid hub.mode');
    }
  });

  test('Subscribing twice to the same topic yields the same url', async () => {
    const res1 = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });
    expect(res1.status).toBe(202);
    expect(res1.body['hub.channel.endpoint']).toMatch(/ws:\/\/localhost:8103\/ws\/fhircast\/*/);
    expect(res1.body['hub.channel.endpoint']).not.toContain('topic');

    const res2 = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });
    expect(res2.status).toBe(202);
    expect(res2.body['hub.channel.endpoint']).toStrictEqual(res1.body['hub.channel.endpoint']);
  });

  test('Subscribing to the same topic from a different project yields a different endpoint', async () => {
    const res1 = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });
    expect(res1.status).toBe(202);
    expect(res1.body['hub.channel.endpoint']).toMatch(/ws:\/\/localhost:8103\/ws\/fhircast\/*/);
    expect(res1.body['hub.channel.endpoint']).not.toContain('topic');

    const res2 = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + tokenForAnotherProject)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });
    expect(res2.status).toBe(202);
    expect(res2.body['hub.channel.endpoint']).not.toStrictEqual(res1.body['hub.channel.endpoint']);
  });

  test('Redis returns `null`', async () => {
    const redis = getRedis();
    const mockCommander = new MockChainableCommander();
    const mockFn = (() => {
      return mockCommander;
    }) as unknown as (commands?: unknown[][]) => ChainableCommander;
    const redisMulti = jest.spyOn(redis, 'multi').mockImplementation(mockFn);

    mockCommander.setNextExecResult(null);

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

    expect(res.status).toBe(500);
    expect(isOperationOutcome(res.body)).toStrictEqual(true);
    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          details: { text: 'Internal server error' },
          diagnostics: 'Error: Failed to get endpoint for topic',
        },
      ],
    });

    redisMulti.mockRestore();
  });

  test('Redis result contains error', async () => {
    const redis = getRedis();
    const mockCommander = new MockChainableCommander();
    const mockFn = (() => {
      return mockCommander;
    }) as unknown as (commands?: unknown[][]) => ChainableCommander;
    const redisMulti = jest.spyOn(redis, 'multi').mockImplementation(mockFn);

    mockCommander.setNextExecResult([
      [null, 'OK'],
      [new Error('Something happened when querying Redis'), null],
    ]);

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

    expect(res.status).toBe(500);
    expect(isOperationOutcome(res.body)).toStrictEqual(true);
    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          details: { text: 'Internal server error' },
          diagnostics: 'Error: Failed to get endpoint for topic',
        },
      ],
    });

    redisMulti.mockRestore();
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

      const pathname = new URL(subRes.body['hub.channel.endpoint']).pathname;

      await request(server)
        .ws(pathname)
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
        .post(`${route}/${topic}`)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          id: randomUUID(),
          event: {},
        });
      expect(res.status).toBe(400);
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
      expect(res.status).toBe(201);
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
      expect(res.status).toBe(201);
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
      expect(res.status).toBe(400);
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
      expect(res.status).toBe(400);
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
      expect(res.status).toBe(400);
      expect(res.body.issue[0].details.text).toStrictEqual('Missing event.context');
    }
  });

  test('Get context', async () => {
    const topic = randomUUID();
    let res;
    // Non-standard FHIRCast extension to support Nuance PowerCast Hub
    res = await request(server)
      .get(`${STU2_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual([]);

    res = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ 'context.type': '', context: [] });
  });

  test('Get context after *-open event', async () => {
    let contextRes;

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
    expect(publishRes.status).toBe(201);

    contextRes = await request(server)
      .get(`${STU2_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toStrictEqual(payload.event.context);

    contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toMatchObject({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: payload.event.context,
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
    expect(publishRes.status).toBe(201);

    let contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toMatchObject({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: payload1.event.context,
    });

    // Users from other projects should not be able to see the context from the original project
    contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + tokenForAnotherProject);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toMatchObject({ 'context.type': '', context: [] });

    // Now set publish another event for the same topic in another project
    publishRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + tokenForAnotherProject)
      .send(payload2);
    expect(publishRes.status).toBe(201);

    // Context for project 1 should still be the same as before
    contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toMatchObject({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: payload1.event.context,
    });

    // Context for project 2 should not be the same as the last published event
    contextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + tokenForAnotherProject);
    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toMatchObject({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context: payload2.event.context,
    });
  });

  test('Get context after *-close event', async () => {
    let beforeContextRes;
    let afterContextRes;

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

    // Setup the key as if we have already opened this resource
    await getRedis().set(
      `medplum:fhircast:project:${project.id as string}:topic:${topic}:latest`,
      JSON.stringify(payload)
    );

    beforeContextRes = await request(server)
      .get(`${STU2_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(beforeContextRes.status).toBe(200);
    expect(beforeContextRes.body).toStrictEqual(context);

    beforeContextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(beforeContextRes.status).toBe(200);
    expect(beforeContextRes.body).toStrictEqual({
      'context.type': 'DiagnosticReport',
      'context.versionId': expect.any(String),
      context,
    });

    const publishRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(createFhircastMessagePayload(topic, 'DiagnosticReport-close', context));
    expect(publishRes.status).toBe(201);

    afterContextRes = await request(server)
      .get(`${STU2_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(afterContextRes.status).toBe(200);
    expect(afterContextRes.body).toStrictEqual([]);

    afterContextRes = await request(server)
      .get(`${STU3_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(afterContextRes.status).toBe(200);
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
    expect(publishRes.status).toBe(201);

    const latestEventStr = (await getRedis().get(
      `medplum:fhircast:project:${project.id as string}:topic:${topic}:latest`
    )) as string;
    expect(latestEventStr).toBeTruthy();
    const latestEvent = JSON.parse(latestEventStr) as FhircastEventPayload<'DiagnosticReport-open'>;
    expect(latestEvent).toMatchObject({
      ...payload,
      event: { ...payload.event, 'context.versionId': expect.any(String) },
    });
  });

  test('`DiagnosticReport-update`: `context.priorVersionId` matches prior `context.versionId`', async () => {
    const topic = randomUUID();

    const context = [
      {
        key: 'report',
        resource: { id: 'abc-123', resourceType: 'DiagnosticReport', status: 'final', code: { text: 'test' } },
      },
      { key: 'updates', resource: { id: 'bundle-123', resourceType: 'Bundle', type: 'searchset' } },
    ] satisfies FhircastEventContext<'DiagnosticReport-update'>[];

    const versionId = randomUUID();
    const payload = createFhircastMessagePayload(topic, 'DiagnosticReport-update', context, versionId);

    const publishRes = await request(server)
      .post(STU3_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload);
    expect(publishRes.status).toBe(201);

    const latestEventStr = (await getRedis().get(
      `medplum:fhircast:project:${project.id as string}:topic:${topic}:latest`
    )) as string;
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
