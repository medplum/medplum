// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { FhircastMessagePayload, WithId } from '@medplum/core';
import {
  ContentType,
  createReference,
  generateId,
  getReferenceString,
  serializeFhircastSubscriptionRequest,
} from '@medplum/core';
import type { DiagnosticReport, Observation, Patient } from '@medplum/fhirtypes';
import type { Express } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { globalLogger } from '../logger';
import { initTestAuth, withTestContext } from '../test.setup';

describe('FHIRcast R4 WebSocket', () => {
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
        server.listen(0, 'localhost', 8521, resolve);
      });
    });

    afterAll(async () => {
      await shutdownApp();
    });

    test('Subscribe and receive event via WebSocket', () =>
      withTestContext(async () => {
        const topic = randomUUID();
        const patientId = randomUUID();

        // Subscribe with URL-encoded body (spec-compliant)
        const res1 = await request(server)
          .post('/fhircast/hub')
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

        expect(res1.status).toBe(202);
        const endpoint = res1.body['hub.channel.endpoint'];
        expect(endpoint).toMatch(/ws.*\/ws\/fhircast-r4\//);

        const pathname = new URL(endpoint).pathname;

        await request(server)
          .ws(pathname)
          .expectJson((obj) => {
            // Subscription confirmation per spec
            expect(obj['hub.mode']).toBe('subscribe');
            expect(obj['hub.topic']).toBe(topic);
            expect(obj['hub.events']).toBe('Patient-open');
            expect(obj['hub.lease_seconds']).toBeDefined();
            expect(typeof obj['hub.lease_seconds']).toBe('number');
          })
          .exec(async () => {
            // Publish a Patient-open event
            const res2 = await request(server)
              .post(`/fhircast/hub/${topic}`)
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
                        id: patientId,
                      },
                    },
                  ],
                },
              });
            expect(res2.status).toBe(202);
          })
          .expectJson((obj) => {
            // Received event notification
            expect(obj.event['hub.topic']).toBe(topic);
            expect(obj.event['hub.event']).toBe('Patient-open');
            expect(obj.event['context.versionId']).toBeDefined();
          })
          // Send ack response per spec
          .sendJson({ id: randomUUID(), status: '200' })
          .close()
          .expectClosed();
      }));

    test('WebSocket confirmation has correct format', () =>
      withTestContext(async () => {
        const topic = randomUUID();

        const res1 = await request(server)
          .post('/fhircast/hub')
          .set('Content-Type', ContentType.FORM_URL_ENCODED)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            serializeFhircastSubscriptionRequest({
              mode: 'subscribe',
              channelType: 'websocket',
              topic,
              events: ['Patient-open', 'Patient-close', 'ImagingStudy-open'],
            })
          );

        const pathname = new URL(res1.body['hub.channel.endpoint']).pathname;

        await request(server)
          .ws(pathname)
          .expectJson((obj) => {
            // Verify confirmation matches spec exactly
            expect(obj).toMatchObject({
              'hub.mode': 'subscribe',
              'hub.topic': topic,
              'hub.events': 'Patient-open,Patient-close,ImagingStudy-open',
              'hub.lease_seconds': expect.any(Number),
            });

            // Verify no extra non-spec fields
            expect(obj['hub.callback']).toBeUndefined();
            expect(obj['hub.channel']).toBeUndefined();
            expect(obj['hub.secret']).toBeUndefined();
            expect(obj['hub.subscriber']).toBeUndefined();
          })
          .close()
          .expectClosed();
      }));

    test('Invalid endpoint sends denial and closes', () =>
      withTestContext(async () => {
        const errorSpy = jest.spyOn(globalLogger, 'error');
        const fakeEndpoint = randomUUID();

        await request(server)
          .ws(`/ws/fhircast-r4/${fakeEndpoint}`)
          .expectJson((obj) => {
            expect(obj['hub.mode']).toBe('denied');
            expect(obj['hub.reason']).toBe('invalid endpoint');
          })
          .expectClosed();

        errorSpy.mockRestore();
      }));

    test('DiagnosticReport suspend-resume via WebSocket', () =>
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
          code: { coding: [{ system: 'http://loinc.org', code: '19005-8' }] },
        };
        const observation1: WithId<Observation> = {
          id: generateId(),
          resourceType: 'Observation',
          status: 'preliminary',
          code: { coding: [{ system: 'http://www.radlex.org', code: 'RID49690' }] },
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
          code: { coding: [{ system: 'http://loinc.org', code: '19005-8' }] },
        };

        // Subscribe
        const res1 = await request(server)
          .post('/fhircast/hub')
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

        const pathname = new URL(res1.body['hub.channel.endpoint']).pathname;

        let lastVersionId: string | undefined;
        let report1VersionId: string | undefined;

        await request(server)
          .ws(pathname)
          .expectJson((obj) => {
            // Confirmation
            expect(obj['hub.mode']).toBe('subscribe');
            expect(obj['hub.topic']).toBe(topic);
          })
          .exec(async () => {
            // Open DiagnosticReport 1
            const res = await request(server)
              .post('/fhircast/hub')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-open',
                  context: [
                    { key: 'report', resource: report1 },
                    { key: 'patient', resource: patient1 },
                  ],
                },
              });
            expect(res.status).toBe(202);
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-open'>) => {
            expect(obj.event['hub.event']).toBe('DiagnosticReport-open');
            expect(obj.event['context.versionId']).toBeDefined();
            lastVersionId = obj.event['context.versionId'];
          })
          .sendJson({ id: generateId(), status: '200' })
          .exec(async () => {
            // Update DiagnosticReport 1 — add Observation
            const res = await request(server)
              .post('/fhircast/hub')
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
                    { key: 'report', reference: createReference(report1) },
                    { key: 'patient', reference: createReference(patient1) },
                    {
                      key: 'updates',
                      resource: {
                        id: generateId(),
                        resourceType: 'Bundle',
                        type: 'transaction',
                        entry: [
                          {
                            request: { method: 'PUT', url: getReferenceString(observation1) },
                            resource: observation1,
                          },
                        ],
                      },
                    },
                  ],
                },
              } satisfies FhircastMessagePayload<'DiagnosticReport-update'>);
            expect(res.status).toBe(202);
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-update'>) => {
            expect(obj.event['hub.event']).toBe('DiagnosticReport-update');
            expect(obj.event['context.versionId']).toBeDefined();
            expect(obj.event['context.versionId']).not.toBe(lastVersionId); // New version
            lastVersionId = obj.event['context.versionId'];
            report1VersionId = lastVersionId;
          })
          .sendJson({ id: generateId(), status: '200' })
          .exec(async () => {
            // Open DiagnosticReport 2 (suspends report 1)
            const res = await request(server)
              .post('/fhircast/hub')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-open',
                  context: [
                    { key: 'report', resource: report2 },
                    { key: 'patient', resource: patient2 },
                  ],
                },
              });
            expect(res.status).toBe(202);
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-open'>) => {
            expect(obj.event['hub.event']).toBe('DiagnosticReport-open');
            lastVersionId = obj.event['context.versionId'];
          })
          .sendJson({ id: generateId(), status: '200' })
          .exec(async () => {
            // Reopen DiagnosticReport 1 — should restore content
            const res = await request(server)
              .post('/fhircast/hub')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-open',
                  context: [
                    { key: 'report', resource: report1 },
                    { key: 'patient', resource: patient1 },
                  ],
                },
              });
            expect(res.status).toBe(202);
          })
          .expectJson((obj: FhircastMessagePayload<'DiagnosticReport-open'>) => {
            expect(obj.event['hub.event']).toBe('DiagnosticReport-open');
            // Should restore the version ID from when we last updated report 1
            expect(obj.event['context.versionId']).toBe(report1VersionId);
          })
          .sendJson({ id: generateId(), status: '200' })
          .exec(async () => {
            // Close DiagnosticReport 1
            const res = await request(server)
              .post('/fhircast/hub')
              .set('Content-Type', ContentType.JSON)
              .set('Authorization', 'Bearer ' + accessToken)
              .send({
                timestamp: new Date().toISOString(),
                id: randomUUID(),
                event: {
                  'hub.topic': topic,
                  'hub.event': 'DiagnosticReport-close',
                  context: [
                    { key: 'report', resource: report1 },
                    { key: 'patient', resource: patient1 },
                  ],
                },
              });
            expect(res.status).toBe(202);
          })
          .expectJson((obj) => {
            expect(obj.event['hub.event']).toBe('DiagnosticReport-close');
          })
          .sendJson({ id: generateId(), status: '200' })
          .exec(async () => {
            // Verify empty context
            const res = await request(server)
              .get(`/fhircast/hub/${topic}`)
              .set('Authorization', 'Bearer ' + accessToken);
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ 'context.type': '', context: [] });
          })
          .close()
          .expectClosed();
      }));

    test('Unsubscribe returns 202', () =>
      withTestContext(async () => {
        const topic = randomUUID();

        // Subscribe
        const res1 = await request(server)
          .post('/fhircast/hub')
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            'hub.channel.type': 'websocket',
            'hub.mode': 'subscribe',
            'hub.topic': topic,
            'hub.events': 'Patient-open',
          });

        const endpoint = res1.body['hub.channel.endpoint'];

        // Unsubscribe
        const res2 = await request(server)
          .post('/fhircast/hub')
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            'hub.channel.type': 'websocket',
            'hub.mode': 'unsubscribe',
            'hub.topic': topic,
            'hub.channel.endpoint': endpoint,
          });

        expect(res2.status).toBe(202);
        expect(res2.body['hub.channel.endpoint']).toBe(endpoint);
      }));
  });
});
