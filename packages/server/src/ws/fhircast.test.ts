// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { FhircastEventName, FhircastMessagePayload, WithId } from '@medplum/core';
import {
  badRequest,
  ContentType,
  createFhircastMessagePayload,
  createReference,
  generateId,
  getReferenceString,
  serializeFhircastSubscriptionRequest,
} from '@medplum/core';
import type { DiagnosticReport, ImagingStudy, Observation, Patient } from '@medplum/fhirtypes';
import type { Express } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'superwstest';
import type { RawData, WebSocket } from 'ws';
import { WebSocket as WebSocketClient } from 'ws';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { globalLogger } from '../logger';
import * as redis from '../redis';
import { initTestAuth, withTestContext } from '../test.setup';
import { handleFhircastConnection } from './fhircast';

describe('FHIRcast WebSocket', () => {
  describe('Basic flow', () => {
    let app: Express;
    let config: MedplumServerConfig;
    let server: Server;
    let accessToken: string;

    beforeAll(async () => {
      vi.spyOn(globalLogger, 'write' as any).mockImplementation(() => undefined);
      app = express();
      config = await loadTestConfig();
      config.heartbeatEnabled = false;
      server = await initApp(app, config);
      accessToken = await initTestAuth({ membership: { admin: true } });
      await new Promise<void>((resolve) => {
        server.listen(0, 'localhost', 8518, resolve);
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
            expect(res2).toHaveStatus(202);
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

    // `DiagnosticReport-select` and `syncerror` establish no context of their own, so the hub only relays them
    test('Send `DiagnosticReport-select` and `syncerror` to subscriber', () =>
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
              events: ['DiagnosticReport-select', 'syncerror'],
            })
          );

        const pathname = new URL(res1.body['hub.channel.endpoint']).pathname;

        const publishEvent = async (payload: FhircastMessagePayload): Promise<void> => {
          const res = await request(server)
            .post(`/fhircast/STU3/${topic}`)
            .set('Content-Type', ContentType.JSON)
            .set('Authorization', 'Bearer ' + accessToken)
            .send(payload);
          expect(res).toHaveStatus(202);
        };

        await request(server)
          .ws(pathname)
          .expectJson((obj) => {
            // Connection verification message
            expect(obj['hub.topic']).toBe(topic);
          })
          .exec(async () => {
            await publishEvent(
              createFhircastMessagePayload(topic, 'DiagnosticReport-select', [
                { key: 'report', reference: { reference: `DiagnosticReport/${generateId()}` } },
                { key: 'select', reference: { reference: `Observation/${generateId()}` } },
              ])
            );
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-select'>) => {
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('DiagnosticReport-select');
            expect(obj.event.context).toHaveLength(2);
          })
          .sendJson({ id: generateId(), status: 200 })
          .exec(async () => {
            await publishEvent(
              createFhircastMessagePayload(topic, 'syncerror', [
                { key: 'operationoutcome', resource: { ...badRequest('Something went wrong'), id: generateId() } },
              ])
            );
          })
          .expectJson((obj: FhircastMessagePayload<'syncerror'>) => {
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('syncerror');
            expect(obj.event.context[0].key).toBe('operationoutcome');
          })
          .sendJson({ id: generateId(), status: 200 })
          .close()
          .expectClosed();
      }));

    // The confirmation must carry the subscriber's event list, and only the fields STU3 defines
    // Source: https://github.com/medplum/medplum/issues/6788
    test('STU3 connection verification is the four fields STU3 defines', () =>
      withTestContext(async () => {
        const topic = randomUUID();

        const res = await request(server)
          .post('/fhircast/STU3')
          .set('Content-Type', ContentType.FORM_URL_ENCODED)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            serializeFhircastSubscriptionRequest({
              mode: 'subscribe',
              channelType: 'websocket',
              topic,
              events: ['Patient-open', 'Patient-close'],
            })
          );

        await request(server)
          .ws(new URL(res.body['hub.channel.endpoint']).pathname)
          .expectJson({
            'hub.mode': 'subscribe',
            'hub.topic': topic,
            'hub.events': 'Patient-open,Patient-close',
            'hub.lease_seconds': 3600,
          })
          .close()
          .expectClosed();
      }));

    // STU3 dropped `hub.callback` and friends, but STU2 clients still expect them
    test('STU2 connection verification keeps the fields STU3 dropped', () =>
      withTestContext(async () => {
        const topic = randomUUID();

        const res = await request(server)
          .post('/fhircast/STU2')
          .set('Content-Type', ContentType.FORM_URL_ENCODED)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            serializeFhircastSubscriptionRequest({
              mode: 'subscribe',
              channelType: 'websocket',
              topic,
              events: ['Patient-open', 'Patient-close'],
            })
          );

        await request(server)
          .ws(new URL(res.body['hub.channel.endpoint']).pathname)
          .expectJson({
            'hub.callback': '',
            'hub.channel': '',
            'hub.events': 'Patient-open,Patient-close',
            'hub.lease_seconds': 3600,
            'hub.mode': 'subscribe',
            'hub.secret': '',
            'hub.subscriber': '',
            'hub.topic': topic,
          })
          .close()
          .expectClosed();
      }));

    // Form-encoded requests commonly carry whitespace after the comma; the confirmation is always
    // the bare comma-separated list the spec calls for
    test('Whitespace in `hub.events` is absent from the confirmation', () =>
      withTestContext(async () => {
        const topic = randomUUID();

        const res = await request(server)
          .post('/fhircast/STU3')
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            'hub.channel.type': 'websocket',
            'hub.mode': 'subscribe',
            'hub.topic': topic,
            'hub.events': 'Patient-open, Patient-close',
          });
        expect(res).toHaveStatus(202);

        await request(server)
          .ws(new URL(res.body['hub.channel.endpoint']).pathname)
          .expectJson({
            'hub.mode': 'subscribe',
            'hub.topic': topic,
            'hub.events': 'Patient-open,Patient-close',
            'hub.lease_seconds': 3600,
          })
          .close()
          .expectClosed();
      }));

    // The `/api/hub` alias serves STU3, so subscriptions made through it are confirmed as STU3
    test('Hub alias connection verification is STU3 shaped', () =>
      withTestContext(async () => {
        const topic = randomUUID();

        const res = await request(server)
          .post('/api/hub')
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

        await request(server)
          .ws(new URL(res.body['hub.channel.endpoint']).pathname)
          .expectJson({
            'hub.mode': 'subscribe',
            'hub.topic': topic,
            'hub.events': 'Patient-open',
            'hub.lease_seconds': 3600,
          })
          .close()
          .expectClosed();
      }));

    test('Only events this subscriber asked for are delivered', () =>
      withTestContext(async () => {
        const topic = randomUUID();

        const res = await request(server)
          .post('/fhircast/STU3')
          .set('Content-Type', ContentType.FORM_URL_ENCODED)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            serializeFhircastSubscriptionRequest({
              mode: 'subscribe',
              channelType: 'websocket',
              topic,
              events: ['ImagingStudy-open'],
            })
          );

        const publishEvent = async (payload: FhircastMessagePayload): Promise<void> => {
          const publishRes = await request(server)
            .post(`/fhircast/STU3/${topic}`)
            .set('Content-Type', ContentType.JSON)
            .set('Authorization', 'Bearer ' + accessToken)
            .send(payload);
          expect(publishRes).toHaveStatus(202);
        };

        await request(server)
          .ws(new URL(res.body['hub.channel.endpoint']).pathname)
          .expectJson((obj) => {
            expect(obj['hub.events']).toBe('ImagingStudy-open');
          })
          .exec(async () => {
            // Published to the same topic, but this subscriber never asked for it
            await publishEvent(
              createFhircastMessagePayload(topic, 'Patient-open', [
                { key: 'patient', resource: { resourceType: 'Patient', id: generateId() } },
              ])
            );
            await publishEvent(
              createFhircastMessagePayload(topic, 'ImagingStudy-open', [
                {
                  key: 'study',
                  resource: {
                    resourceType: 'ImagingStudy',
                    id: generateId(),
                    status: 'available',
                    subject: { reference: `Patient/${generateId()}` },
                  },
                },
              ])
            );
            // `syncerror` reaches every subscriber, subscribed to or not
            await publishEvent(
              createFhircastMessagePayload(topic, 'syncerror', [
                { key: 'operationoutcome', resource: { ...badRequest('Something went wrong'), id: generateId() } },
              ])
            );
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('ImagingStudy-open');
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('syncerror');
          })
          .close()
          .expectClosed();
      }));

    // A subscriber that asked in one casing still receives events published in another
    test('Event names are matched case-insensitively', () =>
      withTestContext(async () => {
        const topic = randomUUID();

        const res = await request(server)
          .post('/fhircast/STU3')
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            'hub.channel.type': 'websocket',
            'hub.mode': 'subscribe',
            'hub.topic': topic,
            'hub.events': 'patient-open',
          });
        expect(res).toHaveStatus(202);

        const publishEvent = async (eventName: string, payload: object): Promise<void> => {
          const publishRes = await request(server)
            .post(`/fhircast/STU3/${topic}`)
            .set('Content-Type', ContentType.JSON)
            .set('Authorization', 'Bearer ' + accessToken)
            .send({
              timestamp: new Date().toISOString(),
              id: randomUUID(),
              event: { 'hub.topic': topic, 'hub.event': eventName, context: [payload] },
            });
          expect(publishRes).toHaveStatus(202);
        };

        await request(server)
          .ws(new URL(res.body['hub.channel.endpoint']).pathname)
          .expectJson((obj) => {
            // The confirmation echoes back the casing the subscriber asked with
            expect(obj['hub.events']).toBe('patient-open');
          })
          .exec(async () => {
            // Never asked for, whatever the casing
            await publishEvent('PATIENT-CLOSE', {
              key: 'patient',
              resource: { resourceType: 'Patient', id: generateId() },
            });
            await publishEvent('Patient-open', {
              key: 'patient',
              resource: { resourceType: 'Patient', id: generateId() },
            });
            await publishEvent('SyncError', {
              key: 'operationoutcome',
              resource: { ...badRequest('Something went wrong'), id: generateId() },
            });
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('Patient-open');
          })
          // `syncerror` reaches every subscriber, in any casing
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('SyncError');
          })
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
            expect(res2).toHaveStatus(202);
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
            expect(res2).toHaveStatus(202);
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
            expect(res2).toHaveStatus(202);
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
            expect(res2).toHaveStatus(202);
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

            expect(res2).toHaveStatus(200);
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
            expect(res2).toHaveStatus(202);
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
            expect(res2).toHaveStatus(202);
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
            expect(res2).toHaveStatus(400);
            expect(res2.body).toMatchObject(
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
            expect(res3).toHaveStatus(400);
            expect(res3.body).toMatchObject(badRequest('Cannot delete resource not currently in the content bundle'));
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
            expect(res2).toHaveStatus(202);
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
            expect(res2).toHaveStatus(202);
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
            expect(res2).toHaveStatus(202);
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

            expect(res2).toHaveStatus(200);
            expect(res2.body).toMatchObject({ context: [], 'context.type': '' });
          })
          .close()
          .expectClosed();
      }));

    // A subscriber is free to append its own query string to the endpoint URL it was handed
    test('Connect with a query string on the endpoint', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        const res = await request(server)
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

        await request(server)
          .ws(`${new URL(res.body['hub.channel.endpoint']).pathname}?token=xyz`)
          .expectJson((obj) => {
            expect(obj['hub.mode']).toBe('subscribe');
            expect(obj['hub.topic']).toBe(topic);
          })
          .close()
          .expectClosed();
      }));

    test('Invalid endpoint', () =>
      withTestContext(async () => {
        const globalLoggerErrorSpy = vi.spyOn(globalLogger, 'error');
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
              expect.stringMatching(/^\[FHIRcast\]: No subscription associated with the endpoint '/)
            );
          })
          .expectClosed();
      }));
  });

  describe('Derived events', () => {
    let app: Express;
    let config: MedplumServerConfig;
    let server: Server;
    let accessToken: string;

    const patient = { resourceType: 'Patient', id: 'derived-patient' } as const;
    const encounter = {
      resourceType: 'Encounter',
      id: 'derived-encounter',
      status: 'in-progress',
      class: { code: 'AMB' },
    } as const;
    const report = {
      resourceType: 'DiagnosticReport',
      id: 'derived-report',
      status: 'final',
      code: { text: 'test' },
    } as const;
    const study = (id: string): ImagingStudy => ({
      resourceType: 'ImagingStudy',
      id,
      status: 'available',
      subject: { reference: `Patient/${patient.id}` },
    });

    beforeAll(async () => {
      vi.spyOn(globalLogger, 'write' as any).mockImplementation(() => undefined);
      app = express();
      config = await loadTestConfig();
      config.heartbeatEnabled = false;
      server = await initApp(app, config);
      accessToken = await initTestAuth({ membership: { admin: true } });
      await new Promise<void>((resolve) => {
        server.listen(0, 'localhost', 8520, resolve);
      });
    });

    afterAll(async () => {
      await shutdownApp();
    });

    async function subscribe(topic: string, events: FhircastEventName[]): Promise<string> {
      const res = await request(server)
        .post('/fhircast/STU3')
        .set('Content-Type', ContentType.FORM_URL_ENCODED)
        .set('Authorization', 'Bearer ' + accessToken)
        .send(serializeFhircastSubscriptionRequest({ mode: 'subscribe', channelType: 'websocket', topic, events }));
      expect(res).toHaveStatus(202);
      return new URL(res.body['hub.channel.endpoint']).pathname;
    }

    async function publishEvent(topic: string, payload: FhircastMessagePayload): Promise<void> {
      const res = await request(server)
        .post(`/fhircast/STU3/${topic}`)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send(payload);
      expect(res).toHaveStatus(202);
    }

    function reportOpen(
      topic: string,
      event: 'DiagnosticReport-open' | 'DiagnosticReport-close',
      studies: string[] = []
    ): FhircastMessagePayload<'DiagnosticReport-open' | 'DiagnosticReport-close'> {
      return createFhircastMessagePayload(topic, event, [
        { key: 'report', resource: report },
        { key: 'patient', resource: patient },
        { key: 'encounter', resource: encounter },
        ...studies.map((id) => ({ key: 'study', resource: study(id) }) as const),
      ]);
    }

    test('A subscriber on only the lesser event receives it derived from the greater one', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        const path = await subscribe(topic, ['Patient-open', 'Patient-close']);

        await request(server)
          .ws(path)
          .expectJson((obj) => {
            expect(obj['hub.events']).toBe('Patient-open,Patient-close');
          })
          .exec(async () => {
            await publishEvent(topic, reportOpen(topic, 'DiagnosticReport-open', ['study-1']));
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('Patient-open');
            // Derived from the report's contexts, and without the STU2-only `encounter` key
            expect(obj.event.context).toStrictEqual([{ key: 'patient', resource: patient }]);
          })
          .exec(async () => {
            // Nothing else from that publish reached this subscriber: the next thing it hears is
            // the event published after it
            await publishEvent(
              topic,
              createFhircastMessagePayload(topic, 'Patient-close', [{ key: 'patient', resource: patient }])
            );
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('Patient-close');
          })
          .close()
          .expectClosed();
      }));

    test('A subscriber on both levels receives both, least specific first', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        const path = await subscribe(topic, ['DiagnosticReport-open', 'Patient-open']);

        await request(server)
          .ws(path)
          .expectJson()
          .exec(async () => {
            await publishEvent(topic, reportOpen(topic, 'DiagnosticReport-open'));
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('Patient-open');
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('DiagnosticReport-open');
          })
          .close()
          .expectClosed();
      }));

    test('A close sequence unwinds in the opposite order', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        const path = await subscribe(topic, ['DiagnosticReport-close', 'Patient-close']);

        await request(server)
          .ws(path)
          .expectJson()
          .exec(async () => {
            await publishEvent(topic, reportOpen(topic, 'DiagnosticReport-close'));
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('DiagnosticReport-close');
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('Patient-close');
          })
          .close()
          .expectClosed();
      }));

    test('Each study in the source becomes its own ImagingStudy-open', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        const path = await subscribe(topic, ['ImagingStudy-open']);

        await request(server)
          .ws(path)
          .expectJson()
          .exec(async () => {
            await publishEvent(topic, reportOpen(topic, 'DiagnosticReport-open', ['study-1', 'study-2']));
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('ImagingStudy-open');
            expect(obj.event.context).toStrictEqual([
              { key: 'study', resource: study('study-1') },
              { key: 'encounter', resource: encounter },
              { key: 'patient', resource: patient },
            ]);
          })
          .expectJson((obj: FhircastMessagePayload) => {
            expect(obj.event['hub.event']).toBe('ImagingStudy-open');
            expect(obj.event.context[0]).toStrictEqual({ key: 'study', resource: study('study-2') });
          })
          .close()
          .expectClosed();
      }));

    test('An event the source cannot support is not derived', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        const path = await subscribe(topic, ['Encounter-open']);

        await request(server)
          .ws(path)
          .expectJson()
          .exec(async () => {
            // No `encounter` context, so there is no `Encounter-open` to derive
            await publishEvent(
              topic,
              createFhircastMessagePayload(topic, 'DiagnosticReport-open', [
                { key: 'report', resource: report },
                { key: 'patient', resource: patient },
              ])
            );
            await publishEvent(
              topic,
              createFhircastMessagePayload(topic, 'Encounter-open', [
                { key: 'encounter', resource: encounter },
                { key: 'patient', resource: patient },
              ])
            );
          })
          .expectJson((obj: FhircastMessagePayload) => {
            // The directly published event, not one derived from the report
            expect(obj.event['hub.event']).toBe('Encounter-open');
            expect(obj.id).toBeDefined();
          })
          .close()
          .expectClosed();
      }));

    test('Every subscriber sees the same derived event', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        const paths = [await subscribe(topic, ['Patient-open']), await subscribe(topic, ['Patient-open'])];

        const { port } = server.address() as AddressInfo;
        const sockets = await Promise.all(
          paths.map(async (path) => {
            const socket = new WebSocketClient(`ws://localhost:${port}${path}`);
            const messages: FhircastMessagePayload[] = [];
            socket.on('message', (data: RawData) => messages.push(JSON.parse((data as Buffer).toString('utf8'))));
            await once(socket, 'open');
            return { socket, messages };
          })
        );

        try {
          await publishEvent(topic, reportOpen(topic, 'DiagnosticReport-open'));
          for (const { messages } of sockets) {
            // The connection confirmation, then the derived event
            await vi.waitFor(() => expect(messages).toHaveLength(2));
          }

          const [first, second] = sockets.map(({ messages }) => messages[1]);
          expect(first.event['hub.event']).toBe('Patient-open');
          // A derived event is one notification, so both subscribers can ack the same id
          expect(second.id).toStrictEqual(first.id);
          expect(second.timestamp).toStrictEqual(first.timestamp);
          expect(second.event).toStrictEqual(first.event);
        } finally {
          for (const { socket } of sockets) {
            socket.close();
          }
        }
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
        server.listen(0, 'localhost', 8519, resolve);
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

  describe('Subscribe failure', () => {
    test('Closes socket and logs when subscribe rejects', () =>
      withTestContext(async () => {
        const subscribeError = new Error('Connection is closed.');
        const cacheSpy = vi.spyOn(redis, 'getCacheRedis').mockReturnValue({
          get: vi
            .fn()
            .mockResolvedValue(
              JSON.stringify({ projectId: 'project-id', topic: 'my-topic', events: ['Patient-open'], version: 'STU3' })
            ),
        } as any);
        const subscriberSpy = vi.spyOn(redis, 'getPubSubRedisSubscriber').mockReturnValue({
          status: 'ready',
          subscribe: vi.fn().mockRejectedValue(subscribeError),
          on: vi.fn(),
          disconnect: vi.fn(),
        } as any);
        const errorSpy = vi.spyOn(globalLogger, 'error').mockImplementation(() => undefined);

        const socket = { on: vi.fn(), send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
        const req = { url: '/ws/fhircast/some-endpoint' } as IncomingMessage;

        try {
          await expect(handleFhircastConnection(socket, req)).resolves.toBeUndefined();
          expect(errorSpy).toHaveBeenCalledWith('[FHIRcast]: Failed to subscribe to topic', {
            err: subscribeError,
          });
          expect(socket.close).toHaveBeenCalled();
        } finally {
          cacheSpy.mockRestore();
          subscriberSpy.mockRestore();
          errorSpy.mockRestore();
        }
      }));

    test('Logs and ignores a client message that is not valid JSON', () =>
      withTestContext(async () => {
        const cacheSpy = vi.spyOn(redis, 'getCacheRedis').mockReturnValue({
          get: vi
            .fn()
            .mockResolvedValue(
              JSON.stringify({ projectId: 'project-id', topic: 'my-topic', events: ['Patient-open'], version: 'STU3' })
            ),
        } as any);
        const subscriberSpy = vi.spyOn(redis, 'getPubSubRedisSubscriber').mockReturnValue({
          subscribe: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          disconnect: vi.fn(),
        } as any);
        const errorSpy = vi.spyOn(globalLogger, 'error').mockImplementation(() => undefined);

        const handlers: Record<string, (...args: any[]) => any> = {};
        const socket = {
          on: vi.fn((event: string, cb: (...args: any[]) => any) => {
            handlers[event] = cb;
          }),
          send: vi.fn(),
          close: vi.fn(),
        } as unknown as WebSocket;
        const req = { url: '/ws/fhircast/some-endpoint' } as IncomingMessage;

        try {
          await handleFhircastConnection(socket, req);
          // A malformed payload must be logged and swallowed, not crash the message handler
          await handlers.message(Buffer.from('{ not valid json'));
          expect(errorSpy).toHaveBeenCalledWith('[FHIRcast]: Failed to parse client message', {
            err: expect.any(SyntaxError),
          });
        } finally {
          cacheSpy.mockRestore();
          subscriberSpy.mockRestore();
          errorSpy.mockRestore();
        }
      }));

    test('Logs and drops a topic message that is not a channel message', () =>
      withTestContext(async () => {
        const cacheSpy = vi.spyOn(redis, 'getCacheRedis').mockReturnValue({
          get: vi.fn().mockResolvedValue(
            JSON.stringify({
              projectId: 'project-id',
              topic: 'my-topic',
              events: ['Patient-open'],
              version: 'STU3',
            })
          ),
        } as any);
        const redisHandlers: Record<string, (...args: any[]) => any> = {};
        const subscriberSpy = vi.spyOn(redis, 'getPubSubRedisSubscriber').mockReturnValue({
          subscribe: vi.fn().mockResolvedValue(undefined),
          on: vi.fn((event: string, cb: (...args: any[]) => any) => {
            redisHandlers[event] = cb;
          }),
          disconnect: vi.fn(),
        } as any);
        const errorSpy = vi.spyOn(globalLogger, 'error').mockImplementation(() => undefined);

        const socket = { on: vi.fn(), send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
        const req = { url: '/ws/fhircast/some-endpoint' } as IncomingMessage;

        try {
          await handleFhircastConnection(socket, req);
          // Ignore the connection verification the socket was just sent
          vi.mocked(socket.send).mockClear();

          // Nothing reaches a subscriber unless it arrives wrapped in a payload
          redisHandlers.message('project-id:my-topic', '{ not valid json');
          redisHandlers.message('project-id:my-topic', JSON.stringify({ target: 'some-endpoint' }));

          expect(socket.send).not.toHaveBeenCalled();
          expect(errorSpy).toHaveBeenCalledWith(
            '[FHIRcast]: Discarding a message published to a topic without a payload'
          );
          expect(errorSpy).toHaveBeenCalledTimes(2);
        } finally {
          cacheSpy.mockRestore();
          subscriberSpy.mockRestore();
          errorSpy.mockRestore();
        }
      }));
  });
});
