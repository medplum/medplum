// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  ContentType,
  createReference,
  CurrentContext,
  FhircastMessagePayload,
  generateId,
  getReferenceString,
  serializeFhircastSubscriptionRequest,
  WithId,
} from '@medplum/core';
import { DiagnosticReport, Observation, OperationOutcome, Patient } from '@medplum/fhirtypes';
import express, { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Server } from 'node:http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
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
            expect(res2.status).toBe(202);
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

    test('Advanced suspend-resume scenario', () =>
      withTestContext(async () => {
        const topic = randomUUID();

        const patient1: WithId<Patient> = {
          id: generateId(),
          resourceType: 'Patient',
          name: [{ use: 'official', given: ['Frodo'], family: 'Baggins' }],
        };
        const report1: WithId<DiagnosticReport> = {
          id: generateId(),
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
          meta: {
            versionId: '1',
          },
        };
        const observation1: WithId<Observation> = {
          id: generateId(),
          resourceType: 'Observation',
          status: 'preliminary',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'imaging',
                  display: 'Imaging',
                },
              ],
            },
          ],
          code: {
            coding: [
              {
                system: 'http://www.radlex.org',
                code: 'RID49690',
                display: 'simple cyst',
              },
            ],
          },
          issued: '2020-09-07T15:02:03.651Z',
          meta: {
            versionId: '1',
          },
        };

        const patient2: WithId<Patient> = {
          id: generateId(),
          resourceType: 'Patient',
          name: [{ use: 'official', given: ['Bilbo'], family: 'Baggins' }],
        };
        const report2: WithId<DiagnosticReport> = {
          id: generateId(),
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
          meta: {
            versionId: '1',
          },
        };

        const res1 = await request(server)
          .post('/fhircast/STU3')
          .set('Content-Type', ContentType.FORM_URL_ENCODED)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            serializeFhircastSubscriptionRequest({
              mode: 'subscribe',
              channelType: 'websocket',
              topic,
              events: ['DiagnosticReport-open', 'DiagnosticReport-close', 'DiagnosticReport-update'],
            })
          );

        const endpoint = res1.body['hub.channel.endpoint'];
        expect(endpoint).not.toContain(`/ws/fhircast/${topic}`);

        const pathname = new URL(endpoint).pathname;

        let lastVersionId: string | undefined;
        let lastReport1VersionId: string | undefined;

        await request(server)
          .ws(pathname)
          .expectJson((obj) => {
            // Connection verification message
            expect(obj['hub.topic']).toBe(topic);
          })
          .exec(async () => {
            // Initial DiagnosticReport-open of Report 1
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-open',
                  context: [
                    {
                      key: 'report',
                      resource: report1,
                    },
                    {
                      key: 'patient',
                      resource: patient1,
                    },
                  ],
                },
              });
            expect(res2.status).toBe(202);
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');

            // Update report 2 -- add observation
            // Open report 1 -- check that content is still there from last update
            // Close report 1 -- make sure empty context
            // Open report 2 -- check that content is still there
            //
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-open'>) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-open');
            expect(obj.event['context.versionId']).toStrictEqual(expect.any(String));
            lastVersionId = obj.event['context.versionId'];
          })
          // For some reason taking object from the previous expect and putting it in a variable does not make it available to the line below
          // TODO: Figure out how to get the proper ID here
          .sendJson({ id: generateId(), status: 200 })
          .exec(async () => {
            // Update report 1 -- add Observation
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-update',
                  'context.versionId': lastVersionId,
                  context: [
                    {
                      key: 'report',
                      reference: createReference(report1),
                    },
                    {
                      key: 'patient',
                      reference: createReference(patient1),
                    },
                    {
                      key: 'updates',
                      resource: {
                        id: generateId(),
                        resourceType: 'Bundle',
                        type: 'transaction',
                        entry: [
                          {
                            request: {
                              method: 'PUT',
                              url: getReferenceString(observation1),
                            },
                            resource: observation1,
                          },
                        ],
                      },
                    },
                  ],
                },
              } satisfies FhircastMessagePayload<'DiagnosticReport-update'>);
            expect(res2.status).toBe(202);
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-update'>) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-update');
            expect(obj.event.context.findIndex((ctx) => ctx.key === 'updates')).not.toStrictEqual(-1);
            lastVersionId = obj.event['context.versionId'];
            // TODO: Check versions
          })
          .sendJson({ id: generateId(), status: 200 })
          // TODO: Check context
          .exec(async () => {
            // Update report 1 -- update previously created Observation
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-update',
                  'context.versionId': lastVersionId,
                  context: [
                    {
                      key: 'report',
                      reference: createReference(report1),
                    },
                    {
                      key: 'patient',
                      reference: createReference(patient1),
                    },
                    {
                      key: 'updates',
                      resource: {
                        id: generateId(),
                        resourceType: 'Bundle',
                        type: 'transaction',
                        entry: [
                          {
                            request: {
                              method: 'PUT',
                              url: getReferenceString(observation1),
                            },
                            resource: { ...observation1, meta: { versionId: '2' } },
                          },
                        ],
                      },
                    },
                  ],
                },
              } satisfies FhircastMessagePayload<'DiagnosticReport-update'>);
            expect(res2.status).toBe(202);
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-update'>) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-update');
            expect(obj.event.context.findIndex((ctx) => ctx.key === 'updates')).not.toStrictEqual(-1);
            lastVersionId = obj.event['context.versionId'];
            // TODO: Check versions
          })
          .sendJson({ id: generateId(), status: 200 })
          // TODO: Check context
          .exec(async () => {
            // Update report 1 -- update DiagnosticReport (no override)
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-update',
                  'context.versionId': lastVersionId,
                  context: [
                    {
                      key: 'report',
                      reference: createReference(report1),
                    },
                    {
                      key: 'patient',
                      reference: createReference(patient1),
                    },
                    {
                      key: 'updates',
                      resource: {
                        id: generateId(),
                        resourceType: 'Bundle',
                        type: 'transaction',
                        entry: [
                          {
                            request: {
                              method: 'PUT',
                              url: getReferenceString(report1),
                            },
                            resource: { ...report1, meta: { versionId: '2' } },
                          },
                        ],
                      },
                    },
                  ],
                },
              } satisfies FhircastMessagePayload<'DiagnosticReport-update'>);
            expect(res2.status).toBe(202);
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-update'>) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-update');
            expect(obj.event.context.findIndex((ctx) => ctx.key === 'updates')).not.toStrictEqual(-1);
            lastVersionId = obj.event['context.versionId'];
            // TODO: Check versions
          })
          .sendJson({ id: generateId(), status: 200 })
          .exec(async () => {
            const res2 = await request(server)
              .get(`/fhircast/STU3/${topic}`)
              .set('Authorization', 'Bearer ' + accessToken);

            expect(res2.status).toEqual(200);
          })
          // TODO: Check context
          .exec(async () => {
            // Update report 1 -- delete Observation previously added
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-update',
                  'context.versionId': lastVersionId,
                  context: [
                    {
                      key: 'report',
                      reference: createReference(report1),
                    },
                    {
                      key: 'patient',
                      reference: createReference(patient1),
                    },
                    {
                      key: 'updates',
                      resource: {
                        id: generateId(),
                        resourceType: 'Bundle',
                        type: 'transaction',
                        entry: [
                          {
                            fullUrl: getReferenceString(observation1),
                            request: {
                              method: 'DELETE',
                              url: getReferenceString(observation1),
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              } satisfies FhircastMessagePayload<'DiagnosticReport-update'>);
            expect(res2.status).toBe(202);
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-update'>) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-update');
            expect(obj.event.context.findIndex((ctx) => ctx.key === 'updates')).not.toStrictEqual(-1);
            lastVersionId = obj.event['context.versionId'];
            // TODO: Check versions
          })
          .sendJson({ id: generateId(), status: 200 })
          // TODO: Check context
          .exec(async () => {
            // Update report 1 -- delete DiagnosticReport from bundle
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-update',
                  'context.versionId': lastVersionId,
                  context: [
                    {
                      key: 'report',
                      reference: createReference(report1),
                    },
                    {
                      key: 'patient',
                      reference: createReference(patient1),
                    },
                    {
                      key: 'updates',
                      resource: {
                        id: generateId(),
                        resourceType: 'Bundle',
                        type: 'transaction',
                        entry: [
                          {
                            fullUrl: getReferenceString(report1),
                            request: {
                              method: 'DELETE',
                              url: getReferenceString(report1),
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              } satisfies FhircastMessagePayload<'DiagnosticReport-update'>);
            expect(res2.status).toBe(202);
            expect(res2.body).toBeDefined();
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-update'>) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-update');
            expect(obj.event['context.versionId']).toStrictEqual(expect.any(String));
            lastVersionId = obj.event['context.versionId'];
            // TODO: Check versions
            lastReport1VersionId = lastVersionId;
          })
          .sendJson({ id: generateId(), status: 200 })
          // TODO: Check context
          .exec(async () => {
            // Update report 1 -- attempt delete DiagnosticReport, since its in original context you can't delete it
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-update',
                  'context.versionId': lastVersionId,
                  context: [
                    {
                      key: 'report',
                      reference: createReference(report1),
                    },
                    {
                      key: 'patient',
                      reference: createReference(patient1),
                    },
                    {
                      key: 'updates',
                      resource: {
                        id: generateId(),
                        resourceType: 'Bundle',
                        type: 'transaction',
                        entry: [
                          {
                            fullUrl: getReferenceString(report1),
                            request: {
                              method: 'DELETE',
                              url: getReferenceString(report1),
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              } satisfies FhircastMessagePayload<'DiagnosticReport-update'>);
            expect(res2.status).toBe(400);
            expect(res2.body).toMatchObject<OperationOutcome>(
              badRequest('Cannot delete a resource that is part of the original open context')
            );
            expect(res2.headers['content-type']).toBe('application/fhir+json; charset=utf-8');

            // Update report 1 -- delete Observation again from bundle, should fail since it's not in the bundle anymore
            const res3 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-update',
                  'context.versionId': lastVersionId,
                  context: [
                    {
                      key: 'report',
                      reference: createReference(report1),
                    },
                    {
                      key: 'patient',
                      reference: createReference(patient1),
                    },
                    {
                      key: 'updates',
                      resource: {
                        id: generateId(),
                        resourceType: 'Bundle',
                        type: 'transaction',
                        entry: [
                          {
                            fullUrl: getReferenceString(observation1),
                            request: {
                              method: 'DELETE',
                              url: getReferenceString(observation1),
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              } satisfies FhircastMessagePayload<'DiagnosticReport-update'>);
            expect(res3.status).toBe(400);
            expect(res3.body).toMatchObject<OperationOutcome>(
              badRequest('Cannot delete resource not currently in the content bundle')
            );
            expect(res2.headers['content-type']).toBe('application/fhir+json; charset=utf-8');
          })
          .exec(async () => {
            // Open report 2
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-open',
                  context: [
                    {
                      key: 'report',
                      resource: report2,
                    },
                    {
                      key: 'patient',
                      resource: patient2,
                    },
                  ],
                },
              });
            expect(res2.status).toBe(202);
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-open'>) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-open');
            expect(obj.event['context.versionId']).toStrictEqual(expect.any(String));
            lastVersionId = obj.event['context.versionId'];
          })
          .sendJson({ id: generateId(), status: 200 })
          .exec(async () => {
            // Open report 1 again
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-open',
                  context: [
                    {
                      key: 'report',
                      resource: report1,
                    },
                    {
                      key: 'patient',
                      resource: patient1,
                    },
                  ],
                },
              });
            expect(res2.status).toBe(202);
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');

            // Close report 1 -- make sure empty context
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-open'>) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-open');
            expect(obj.event['context.versionId']).toStrictEqual(expect.any(String));
            lastVersionId = obj.event['context.versionId'];
            expect(obj.event['context.versionId']).toStrictEqual(lastReport1VersionId);
          })
          .sendJson({ id: generateId(), status: 200 })
          .exec(async () => {
            // Close report 1 -- make sure empty context
            const res2 = await request(server)
              .post('/fhircast/STU3')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-close',
                  context: [
                    {
                      key: 'report',
                      resource: report1,
                    },
                    {
                      key: 'patient',
                      resource: patient1,
                    },
                  ],
                },
              });
            expect(res2.status).toBe(202);
            expect(res2.headers['content-type']).toBe('application/json; charset=utf-8');
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-open'>) => {
            // Event message
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-close');
            expect(obj.event['context.versionId']).toBeUndefined();
            lastVersionId = obj.event['context.versionId'];
          })
          .sendJson({ id: generateId(), status: 200 })
          .exec(async () => {
            const res2 = await request(server)
              .get(`/fhircast/STU3/${topic}`)
              .set('Authorization', 'Bearer ' + accessToken);

            expect(res2.status).toEqual(200);
            expect(res2.body).toMatchObject<CurrentContext<''>>({ context: [], 'context.type': '' });
          })
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
      config.heartbeatMilliseconds = 300;
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

                // setInterval doesn't guarantee a minimum time between executions, so we give a little leniency for the 300ms
                // Because our tests run in very unstable conditions on GitHub, we give a lot of tolerance since the pinned CPU
                // can result in very early firing
                expect(endTime - startTime).toBeGreaterThanOrEqual(150);
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
