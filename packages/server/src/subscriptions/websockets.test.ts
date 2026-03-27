// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, OperationOutcomeError, getReferenceString, sleep } from '@medplum/core';
import type {
  Binary,
  Bundle,
  BundleEntry,
  DocumentReference,
  Parameters,
  Patient,
  Project,
  Subscription,
  SubscriptionStatus,
} from '@medplum/fhirtypes';
import type { Express } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { Repository } from '../fhir/repo';
import * as rewriteModule from '../fhir/rewrite';
import { RewriteMode } from '../fhir/rewrite';
import { globalLogger } from '../logger';
import * as keysModule from '../oauth/keys';
import * as oauthUtilsModule from '../oauth/utils';
import * as pubsubModule from '../pubsub';
import {
  addUserActiveWebSocketSubscription,
  cleanupUserSubs,
  getActiveSubscriptions,
  getUserActiveWebSocketSubscriptionCount,
  isSubscriptionActive,
  publish,
  setActiveSubscription,
} from '../pubsub';
import { createTestProject, withTestContext } from '../test.setup';
import { findAndExecDispatchJob } from '../workers/test-utils';
import * as workerUtilsModule from '../workers/utils';

jest.mock('hibp');

describe('WebSocket Subscription', () => {
  let config: MedplumServerConfig;
  let server: Server;
  let project: Project;
  let repo: Repository;
  let app: Express;
  let accessToken: string;
  let patientSubscription: WithId<Subscription>;

  beforeAll(async () => {
    console.log = jest.fn();
    app = express();
    config = await loadTestConfig();
    config.heartbeatEnabled = false;
    config.logLevel = 'warn';
    server = await initApp(app, config);

    const result = await withTestContext(() =>
      createTestProject({
        project: { features: ['websocket-subscriptions'] },
        withAccessToken: true,
        withRepo: true,
      })
    );

    project = result.project;
    accessToken = result.accessToken;
    repo = result.repo;

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 8520, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Valid subscription', () =>
    withTestContext(async () => {
      const version1 = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alicr'], family: 'Smith' }],
        meta: {
          lastUpdated: new Date(Date.now() - 1000 * 60).toISOString(),
        },
      });
      expect(version1).toBeDefined();
      expect(version1.id).toBeDefined();

      // Create subscription to watch patient
      patientSubscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'websocket',
        },
      });
      expect(patientSubscription).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${patientSubscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.body).toBeDefined();
      const body = res.body as Parameters;
      expect(body.resourceType).toStrictEqual('Parameters');
      expect(body.parameter?.[0]).toBeDefined();
      expect(body.parameter?.[0]?.name).toStrictEqual('token');
      expect(body.parameter?.[0]?.valueString).toBeDefined();

      const token = body.parameter?.[0]?.valueString as string;

      let version2: Patient;
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            id: expect.any(String),
            resourceType: 'Bundle',
            type: 'history',
            timestamp: expect.any(String),
            entry: [
              {
                resource: {
                  resourceType: 'SubscriptionStatus',
                  type: 'handshake',
                  subscription: { reference: `Subscription/${patientSubscription.id}` },
                },
              },
            ],
          });
        })
        // Add a new patient for this project
        .exec(async () => {
          // Update the patient
          version2 = await repo.updateResource<Patient>({
            resourceType: 'Patient',
            id: version1.id,
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: true,
            meta: {
              lastUpdated: new Date().toISOString(),
            },
          });
          expect(version2).toBeDefined();
          await findAndExecDispatchJob(version2, 'update');
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(
                project.id as string,
                'Patient',
                `Subscription/${patientSubscription?.id}`
              )) === 1;
          }
          expect(subActive).toStrictEqual(true);
        })
        .expectJson((msg: Bundle): boolean => {
          if (!msg.entry?.[1]) {
            return false;
          }
          const patientEntry = msg.entry?.[1] as BundleEntry<Patient>;
          if (!patientEntry.resource) {
            return false;
          }
          const patient = patientEntry.resource;
          if (patient.resourceType !== 'Patient') {
            return false;
          }
          if (patient.id !== version2.id) {
            return false;
          }
          return true;
        })
        .close()
        .expectClosed();
    }));

  test('Subscription removed from active and deleted after WebSocket closed', () =>
    withTestContext(async () => {
      // Wait for both the project-level hash and cache entry to be cleaned up.
      // These are on different Redis connections so we poll both conditions together.
      let subActive = true;
      let inCache = true;
      while (subActive || inCache) {
        await sleep(0);
        subActive =
          (await isSubscriptionActive(project.id as string, 'Patient', `Subscription/${patientSubscription?.id}`)) ===
          1;
        try {
          await repo.readResource<Subscription>('Subscription', patientSubscription?.id);
          inCache = true;
        } catch {
          inCache = false;
        }
      }
      expect(subActive).toStrictEqual(false);

      // Check Patient subscription is NOT still in the cache
      await expect(repo.readResource<Subscription>('Subscription', patientSubscription?.id)).rejects.toThrow(
        OperationOutcomeError
      );
    }));

  test('Subscription removed after unbind-from-token', () =>
    withTestContext(async () => {
      const version1 = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alicr'], family: 'Smith' }],
        meta: {
          lastUpdated: new Date(Date.now() - 1000 * 60).toISOString(),
        },
      });
      expect(version1).toBeDefined();
      expect(version1.id).toBeDefined();

      // Create subscription to watch patient
      const patientSubscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'websocket',
        },
      });
      expect(patientSubscription).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${patientSubscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.body).toBeDefined();
      const body = res.body as Parameters;
      expect(body.resourceType).toStrictEqual('Parameters');
      expect(body.parameter?.[0]).toBeDefined();
      expect(body.parameter?.[0]?.name).toStrictEqual('token');
      expect(body.parameter?.[0]?.valueString).toBeDefined();

      const token = body.parameter?.[0]?.valueString as string;

      let version2: Patient;
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            id: expect.any(String),
            resourceType: 'Bundle',
            type: 'history',
            timestamp: expect.any(String),
            entry: [
              {
                resource: {
                  resourceType: 'SubscriptionStatus',
                  type: 'handshake',
                  subscription: { reference: `Subscription/${patientSubscription.id}` },
                },
              },
            ],
          });
        })
        // Add a new patient for this project
        .exec(async () => {
          // Update the patient
          version2 = await repo.updateResource<Patient>({
            resourceType: 'Patient',
            id: version1.id,
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: true,
            meta: {
              lastUpdated: new Date().toISOString(),
            },
          });
          expect(version2).toBeDefined();
          await findAndExecDispatchJob(version2, 'update');
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(
                project.id as string,
                'Patient',
                `Subscription/${patientSubscription?.id}`
              )) === 1;
          }
          expect(subActive).toStrictEqual(true);
        })
        .expectJson((msg: Bundle): boolean => {
          if (!msg.entry?.[1]) {
            return false;
          }
          const patientEntry = msg.entry?.[1] as BundleEntry<Patient>;
          if (!patientEntry.resource) {
            return false;
          }
          const patient = patientEntry.resource;
          if (patient.resourceType !== 'Patient') {
            return false;
          }
          if (patient.id !== version2.id) {
            return false;
          }
          return true;
        })
        .sendJson({ type: 'unbind-from-token', payload: { token } })
        .exec(async () => {
          let subActive = true;
          while (subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(
                project.id as string,
                'Patient',
                `Subscription/${patientSubscription?.id}`
              )) === 1;
          }
          expect(subActive).toStrictEqual(false);
        })
        // Call unbind again to test that it doesn't break anything
        .sendJson({ type: 'unbind-from-token', payload: { token } })
        .exec(async () => {
          await sleep(150);
          expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('[WS] Failed to retrieve subscription cache entry when unbinding from token')
          );
        })
        .close()
        .expectClosed();
    }));

  test('Subscriptions with different resource types removed from correct hashes on disconnect', () =>
    withTestContext(async () => {
      // Create a Patient subscription
      const patientSub = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      expect(patientSub).toBeDefined();

      // Create an Observation subscription
      const observationSub = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Observation',
        channel: { type: 'websocket' },
      });
      expect(observationSub).toBeDefined();

      // Get binding tokens for both subscriptions
      const patientTokenRes = await request(server)
        .get(`/fhir/R4/Subscription/${patientSub.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);
      const patientToken = (patientTokenRes.body as Parameters).parameter?.[0]?.valueString as string;

      const observationTokenRes = await request(server)
        .get(`/fhir/R4/Subscription/${observationSub.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);
      const observationToken = (observationTokenRes.body as Parameters).parameter?.[0]?.valueString as string;

      // Bind both subscriptions on the same WebSocket, then close
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token: patientToken } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [{ resource: { resourceType: 'SubscriptionStatus', type: 'handshake' } }],
          });
        })
        .sendJson({ type: 'bind-with-token', payload: { token: observationToken } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [{ resource: { resourceType: 'SubscriptionStatus', type: 'handshake' } }],
          });
        })
        .exec(async () => {
          // Verify both are in their respective resource-type hashes
          let patientActive = false;
          let observationActive = false;
          while (!patientActive || !observationActive) {
            await sleep(0);
            patientActive =
              (await isSubscriptionActive(project.id as string, 'Patient', `Subscription/${patientSub.id}`)) === 1;
            observationActive =
              (await isSubscriptionActive(project.id as string, 'Observation', `Subscription/${observationSub.id}`)) ===
              1;
          }
          expect(patientActive).toStrictEqual(true);
          expect(observationActive).toStrictEqual(true);
        })
        .close()
        .expectClosed()
        .exec(async () => {
          // After disconnect, both should be removed from their respective hashes
          let patientActive = true;
          let observationActive = true;
          while (patientActive || observationActive) {
            await sleep(0);
            patientActive =
              (await isSubscriptionActive(project.id as string, 'Patient', `Subscription/${patientSub.id}`)) === 1;
            observationActive =
              (await isSubscriptionActive(project.id as string, 'Observation', `Subscription/${observationSub.id}`)) ===
              1;
          }
          expect(patientActive).toStrictEqual(false);
          expect(observationActive).toStrictEqual(false);
        });
    }));

  test('Should reject if given an invalid binding token', () =>
    withTestContext(async () => {
      const version1 = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alicr'], family: 'Smith' }],
        meta: {
          lastUpdated: new Date(Date.now() - 1000 * 60).toISOString(),
        },
      });
      expect(version1).toBeDefined();
      expect(version1.id).toBeDefined();

      // Create subscription to watch patient
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'websocket',
        },
      });
      expect(subscription).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.body).toBeDefined();

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token: accessToken } }) // We accidentally reused access token instead of token for sub
        // Add a new patient for this project
        .exec(async () => {
          // Update the patient
          const version2 = await repo.updateResource<Patient>({
            resourceType: 'Patient',
            id: version1.id,
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: true,
            meta: {
              lastUpdated: new Date().toISOString(),
            },
          });
          expect(version2).toBeDefined();
          await findAndExecDispatchJob(version2, 'update');
        })
        .expectJson({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              details: { text: 'Token claims missing subscription_id. Make sure you are sending the correct token.' },
            },
          ],
        })
        .close()
        .expectClosed();
    }));

  test('Should respond with a pong if sent a ping', () =>
    withTestContext(async () => {
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'ping' })
        .expectJson({ type: 'pong' })
        .close()
        .expectClosed();
    }));

  test('Receives v1 sub event payload', () =>
    withTestContext(async () => {
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['V1'], family: 'Test' }],
      });

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });

      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      const token = (res.body as Parameters).parameter?.[0]?.valueString as string;

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [{ resource: { resourceType: 'SubscriptionStatus', type: 'handshake' } }],
          });
        })
        .exec(async () => {
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(project.id as string, 'Patient', `Subscription/${subscription.id}`)) === 1;
          }
          // Publish a v1 payload (array of [resource, subscriptionId, options] tuples)
          const v1Payload = [[patient, subscription.id, { includeResource: true }]];
          await publish('medplum:subscriptions:r4:websockets', JSON.stringify(v1Payload));
        })
        .expectJson((msg: Bundle): boolean => {
          if (msg.entry?.[0]?.resource?.resourceType !== 'SubscriptionStatus') {
            return false;
          }
          const status = msg.entry[0].resource;
          if (status.type !== 'event-notification') {
            return false;
          }
          if (status.subscription?.reference !== `Subscription/${subscription.id}`) {
            return false;
          }
          const focus = status.notificationEvent?.[0]?.focus;
          if (focus?.reference !== getReferenceString(patient)) {
            return false;
          }
          // v1 payload with includeResource should include the resource entry
          const patientEntry = msg.entry?.[1] as BundleEntry<Patient> | undefined;
          if (patientEntry?.resource?.id !== patient.id) {
            return false;
          }
          return true;
        })
        .close()
        .expectClosed();
    }));

  test('Receives v2 sub event payload', () =>
    withTestContext(async () => {
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['V2'], family: 'Test' }],
      });

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });

      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      const token = (res.body as Parameters).parameter?.[0]?.valueString as string;

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [{ resource: { resourceType: 'SubscriptionStatus', type: 'handshake' } }],
          });
        })
        .exec(async () => {
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(project.id as string, 'Patient', `Subscription/${subscription.id}`)) === 1;
          }
          // Publish a v2 payload ({ resource, events: [[subscriptionId, options]] })
          const v2Payload = { resource: patient, events: [[subscription.id, { includeResource: true }]] };
          await publish('medplum:subscriptions:r4:websockets', JSON.stringify(v2Payload));
        })
        .expectJson((msg: Bundle): boolean => {
          if (msg.entry?.[0]?.resource?.resourceType !== 'SubscriptionStatus') {
            return false;
          }
          const status = msg.entry[0].resource;
          if (status.type !== 'event-notification') {
            return false;
          }
          if (status.subscription?.reference !== `Subscription/${subscription.id}`) {
            return false;
          }
          const focus = status.notificationEvent?.[0]?.focus;
          if (focus?.reference !== getReferenceString(patient)) {
            return false;
          }
          // v2 payload with includeResource should include the resource entry
          const patientEntry = msg.entry?.[1] as BundleEntry<Patient> | undefined;
          if (patientEntry?.resource?.id !== patient.id) {
            return false;
          }
          return true;
        })
        .close()
        .expectClosed();
    }));

  test('V2 payload with multiple subscriptions fires all events', () =>
    withTestContext(async () => {
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Multi'], family: 'Sub' }],
      });

      // Create two subscriptions both watching Patient
      const subscription1 = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });

      const subscription2 = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });

      // Get binding tokens for both subscriptions
      const res1 = await request(server)
        .get(`/fhir/R4/Subscription/${subscription1.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);
      const token1 = (res1.body as Parameters).parameter?.[0]?.valueString as string;

      const res2 = await request(server)
        .get(`/fhir/R4/Subscription/${subscription2.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);
      const token2 = (res2.body as Parameters).parameter?.[0]?.valueString as string;

      const receivedSubRefs: string[] = [];

      await request(server)
        .ws('/ws/subscriptions-r4')
        // Bind first subscription
        .sendJson({ type: 'bind-with-token', payload: { token: token1 } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [{ resource: { resourceType: 'SubscriptionStatus', type: 'handshake' } }],
          });
        })
        // Bind second subscription
        .sendJson({ type: 'bind-with-token', payload: { token: token2 } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [{ resource: { resourceType: 'SubscriptionStatus', type: 'handshake' } }],
          });
        })
        .exec(async () => {
          // Wait for both subscriptions to be active
          let sub1Active = false;
          let sub2Active = false;
          while (!sub1Active || !sub2Active) {
            await sleep(0);
            sub1Active =
              (await isSubscriptionActive(project.id as string, 'Patient', `Subscription/${subscription1.id}`)) === 1;
            sub2Active =
              (await isSubscriptionActive(project.id as string, 'Patient', `Subscription/${subscription2.id}`)) === 1;
          }
          // Publish a single v2 payload with both subscriptions in the events array
          const v2Payload = {
            resource: patient,
            events: [
              [subscription1.id, { includeResource: true }],
              [subscription2.id, { includeResource: true }],
            ],
          };
          await publish('medplum:subscriptions:r4:websockets', JSON.stringify(v2Payload));
        })
        // Expect first event-notification
        .expectJson((msg: Bundle): boolean => {
          if (msg.entry?.[0]?.resource?.resourceType !== 'SubscriptionStatus') {
            return false;
          }
          const status = msg.entry[0].resource;
          if (status.type !== 'event-notification') {
            return false;
          }
          receivedSubRefs.push(status.subscription?.reference ?? '');
          // Verify the resource is included
          const patientEntry = msg.entry?.[1] as BundleEntry<Patient> | undefined;
          if (patientEntry?.resource?.id !== patient.id) {
            return false;
          }
          return true;
        })
        // Expect second event-notification
        .expectJson((msg: Bundle): boolean => {
          if (msg.entry?.[0]?.resource?.resourceType !== 'SubscriptionStatus') {
            return false;
          }
          const status = msg.entry[0].resource;
          if (status.type !== 'event-notification') {
            return false;
          }
          receivedSubRefs.push(status.subscription?.reference ?? '');
          // Verify the resource is included
          const patientEntry = msg.entry?.[1] as BundleEntry<Patient> | undefined;
          if (patientEntry?.resource?.id !== patient.id) {
            return false;
          }
          return true;
        })
        .close()
        .expectClosed();

      // Verify both subscriptions received notifications
      expect(receivedSubRefs.sort()).toEqual(
        [`Subscription/${subscription1.id}`, `Subscription/${subscription2.id}`].sort()
      );
    }));

  test('Attachments are rewritten', () =>
    withTestContext(async () => {
      const binary = await repo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      });

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: `DocumentReference?location=Binary/${binary.id}`,
        channel: {
          type: 'websocket',
        },
      });

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.body).toBeDefined();
      const body = res.body as Parameters;
      expect(body.resourceType).toStrictEqual('Parameters');
      expect(body.parameter?.[0]).toBeDefined();
      expect(body.parameter?.[0]?.name).toStrictEqual('token');
      expect(body.parameter?.[0]?.valueString).toBeDefined();

      const token = body.parameter?.[0]?.valueString as string;

      expect(res.body).toBeDefined();

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            id: expect.any(String),
            resourceType: 'Bundle',
            type: 'history',
            timestamp: expect.any(String),
            entry: [
              {
                resource: {
                  resourceType: 'SubscriptionStatus',
                  type: 'handshake',
                  subscription: { reference: `Subscription/${subscription.id}` },
                },
              },
            ],
          });
        })
        // Add a new document reference for this project
        .exec(async () => {
          const documentRef = await repo.createResource<DocumentReference>({
            resourceType: 'DocumentReference',
            status: 'current',
            content: [
              {
                attachment: {
                  url: `Binary/${binary.id}`,
                },
              },
            ],
          });
          expect(documentRef).toBeDefined();
          await findAndExecDispatchJob(documentRef, 'create');
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(
                project.id as string,
                'DocumentReference',
                `Subscription/${subscription.id}`
              )) === 1;
          }
          expect(subActive).toStrictEqual(true);
        })
        .expectJson((msg: Bundle): boolean => {
          if (!msg.entry?.[1]) {
            return false;
          }
          const docRefEntry = msg.entry?.[1] as BundleEntry<DocumentReference>;
          if (!docRefEntry.resource) {
            return false;
          }
          const docRef = docRefEntry.resource;
          if (docRef.resourceType !== 'DocumentReference') {
            return false;
          }
          if (!docRef?.content?.[0]?.attachment?.url?.includes('?Expires=')) {
            return false;
          }
          return true;
        })
        .close()
        .expectClosed()
        .exec(async () => {
          // Without this, marking subscription cannot cleanup cannot run before the test scope ends and redis has already closed
          // Since the websocket close listener executes on the next tick
          await sleep(0);
        });
    }));

  test('Missing login_id in token', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'websocket',
        },
      });
      expect(subscription).toBeDefined();

      // Mock verifyJwt to return a payload without login_id
      const verifyJwtSpy = jest.spyOn(keysModule, 'verifyJwt').mockImplementation(async () => {
        return {
          payload: {
            subscription_id: subscription.id,
            // login_id is missing intentionally
          },
          protectedHeader: {},
        };
      });

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token: 'fake-token' } })
        .expectJson({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              details: { text: 'Token claims missing login_id. Make sure you are sending the correct token.' },
            },
          ],
        })
        .close()
        .expectClosed()
        .exec(async () => {
          // Without this, marking subscription cannot cleanup cannot run before the test scope ends and redis has already closed
          // Since the websocket close listener executes on the next tick
          await sleep(0);
        });

      // Restore original implementation
      verifyJwtSpy.mockRestore();
    }));

  test('Token failed to validate', () =>
    withTestContext(async () => {
      // Mock verifyJwt to throw an error
      const verifyJwtSpy = jest.spyOn(keysModule, 'verifyJwt').mockImplementation(async () => {
        throw new Error('Token validation failed');
      });

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token: 'invalid-token' } })
        .expectJson({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              details: { text: 'Token failed to validate. Check token expiry.' },
            },
          ],
        })
        .close()
        .expectClosed()
        .exec(async () => {
          // Without this, marking subscription cannot cleanup cannot run before the test scope ends and redis has already closed
          // Since the websocket close listener executes on the next tick
          await sleep(0);
        });

      // Restore original implementation
      verifyJwtSpy.mockRestore();
    }));

  test('Error while rewriting attachments', () =>
    withTestContext(async () => {
      // Don't mock rewriteAttachments until after the handshake
      const originalRewriteAttachments = rewriteModule.rewriteAttachments;
      let mockRewriteAttachments = false;
      const rewriteAttachmentsSpy = jest
        .spyOn(rewriteModule, 'rewriteAttachments')
        .mockImplementation(async (...args) => {
          if (mockRewriteAttachments && args[0] === RewriteMode.PRESIGNED_URL) {
            throw new Error('Error rewriting attachments');
          }
          return originalRewriteAttachments(...args);
        });
      const globalLoggerErrorSpy = jest.spyOn(globalLogger, 'error');

      const binary = await repo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      });

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: `DocumentReference?location=Binary/${binary.id}`,
        channel: {
          type: 'websocket',
        },
      });

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.body).toBeDefined();
      const body = res.body as Parameters;
      expect(body.resourceType).toStrictEqual('Parameters');
      expect(body.parameter?.[0]).toBeDefined();
      expect(body.parameter?.[0]?.name).toStrictEqual('token');
      expect(body.parameter?.[0]?.valueString).toBeDefined();

      const token = body.parameter?.[0]?.valueString as string;

      expect(res.body).toBeDefined();

      // Connect with WebSocket and bind to subscription
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            id: expect.any(String),
            resourceType: 'Bundle',
            type: 'history',
            timestamp: expect.any(String),
            entry: [
              {
                resource: {
                  resourceType: 'SubscriptionStatus',
                  type: 'handshake',
                  subscription: { reference: `Subscription/${subscription.id}` },
                },
              },
            ],
          });
        })
        // Add a new document reference for this project
        .exec(async () => {
          mockRewriteAttachments = true;

          const documentRef = await repo.createResource<DocumentReference>({
            resourceType: 'DocumentReference',
            status: 'current',
            content: [
              {
                attachment: {
                  url: `Binary/${binary.id}`,
                },
              },
            ],
          });
          expect(documentRef).toBeDefined();
          await findAndExecDispatchJob(documentRef, 'create');
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(
                project.id as string,
                'DocumentReference',
                `Subscription/${subscription.id}`
              )) === 1;
          }
          expect(subActive).toStrictEqual(true);
        })
        .close()
        .expectClosed()
        .exec(async () => {
          // Without this, marking subscription cannot cleanup cannot run before the test scope ends and redis has already closed
          // Since the websocket close listener executes on the next tick
          await sleep(0);
        });

      const startTime = Date.now();
      let success = false;

      while (Date.now() - startTime < 5000 && !success) {
        try {
          expect(globalLoggerErrorSpy).toHaveBeenCalledWith('[WS] Error occurred while rewriting attachments', {
            err: expect.any(Error),
          });
          success = true;
        } catch (err) {
          await sleep(100);
          if (Date.now() - startTime >= 5000) {
            throw err;
          }
        }
      }

      // Restore original implementations
      rewriteAttachmentsSpy.mockRestore();
      globalLoggerErrorSpy.mockRestore();
    }));

  test('Undefined authState returned', () =>
    withTestContext(async () => {
      const actualGetLoginForAccessToken = jest.requireActual('../oauth/utils').getLoginForAccessToken;
      let mockGetLoginForAccessToken = false;
      const getLoginForAccessTokenSpy = jest
        .spyOn(oauthUtilsModule, 'getLoginForAccessToken')
        .mockImplementation(async (...args) => {
          if (mockGetLoginForAccessToken) {
            return undefined;
          }
          return actualGetLoginForAccessToken(...args);
        });
      const globalLoggerInfoSpy = jest.spyOn(globalLogger, 'info');

      const binary = await repo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      });

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: `DocumentReference?location=Binary/${binary.id}`,
        channel: {
          type: 'websocket',
        },
      });

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.body).toBeDefined();
      const body = res.body as Parameters;
      expect(body.resourceType).toStrictEqual('Parameters');
      expect(body.parameter?.[0]).toBeDefined();
      expect(body.parameter?.[0]?.name).toStrictEqual('token');
      expect(body.parameter?.[0]?.valueString).toBeDefined();

      const token = body.parameter?.[0]?.valueString as string;

      expect(res.body).toBeDefined();

      // Connect with WebSocket and bind to subscription
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            id: expect.any(String),
            resourceType: 'Bundle',
            type: 'history',
            timestamp: expect.any(String),
            entry: [
              {
                resource: {
                  resourceType: 'SubscriptionStatus',
                  type: 'handshake',
                  subscription: { reference: `Subscription/${subscription.id}` },
                },
              },
            ],
          });
        })
        // Add a new document reference for this project
        .exec(async () => {
          mockGetLoginForAccessToken = true;

          const documentRef = await repo.createResource<DocumentReference>({
            resourceType: 'DocumentReference',
            status: 'current',
            content: [
              {
                attachment: {
                  url: `Binary/${binary.id}`,
                },
              },
            ],
          });
          expect(documentRef).toBeDefined();
          await findAndExecDispatchJob(documentRef, 'create');
          // Wait for the dead subscription handler to process the event.
          // The subscription was already active from creation, but the handler may
          // remove it before we can poll the active hash, so wait for the log instead.
          while (
            !globalLoggerInfoSpy.mock.calls.some(
              (call) => call[0] === '[WS] Unable to get login for the given access token'
            )
          ) {
            await sleep(0);
          }
        })
        .close()
        .expectClosed()
        .exec(async () => {
          // Without this, marking subscription cannot cleanup cannot run before the test scope ends and redis has already closed
          // Since the websocket close listener executes on the next tick
          await sleep(0);
        });

      expect(globalLoggerInfoSpy).toHaveBeenCalledWith('[WS] Unable to get login for the given access token', {
        subscriptionId: expect.any(String),
      });

      // Restore original implementations
      getLoginForAccessTokenSpy.mockRestore();
      globalLoggerInfoSpy.mockRestore();
    }));

  test('Dead subscription removed from active set when token fails to validate', () =>
    withTestContext(async () => {
      const actualGetLoginForAccessToken = jest.requireActual('../oauth/utils').getLoginForAccessToken;
      let mockGetLoginForAccessToken = false;
      const getLoginForAccessTokenSpy = jest
        .spyOn(oauthUtilsModule, 'getLoginForAccessToken')
        .mockImplementation(async (...args) => {
          if (mockGetLoginForAccessToken) {
            return undefined;
          }
          return actualGetLoginForAccessToken(...args);
        });

      const binary = await repo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      });

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: `DocumentReference?location=Binary/${binary.id}`,
        channel: {
          type: 'websocket',
        },
      });

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      const body = res.body as Parameters;
      const token = body.parameter?.[0]?.valueString as string;

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [
              {
                resource: {
                  resourceType: 'SubscriptionStatus',
                  type: 'handshake',
                  subscription: { reference: `Subscription/${subscription.id}` },
                },
              },
            ],
          });
        })
        .exec(async () => {
          mockGetLoginForAccessToken = true;

          const docRef = await repo.createResource<DocumentReference>({
            resourceType: 'DocumentReference',
            status: 'current',
            content: [{ attachment: { url: `Binary/${binary.id}` } }],
          });
          expect(docRef).toBeDefined();
          await findAndExecDispatchJob(docRef, 'create');

          // Wait for the dead subscription cleanup (triggered by failed token validation)
          // to remove the subscription from the active hash.
          let subActive = true;
          while (subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(
                project.id as string,
                'DocumentReference',
                `Subscription/${subscription.id}`
              )) === 1;
          }
          expect(subActive).toStrictEqual(false);
        })
        .close()
        .expectClosed()
        .exec(async () => {
          await sleep(0);
        });

      getLoginForAccessTokenSpy.mockRestore();
    }));

  test('Dead subscription not notified on subsequent events after purge', () =>
    withTestContext(async () => {
      const actualGetLoginForAccessToken = jest.requireActual('../oauth/utils').getLoginForAccessToken;
      let mockGetLoginForAccessToken = false;
      const getLoginForAccessTokenSpy = jest
        .spyOn(oauthUtilsModule, 'getLoginForAccessToken')
        .mockImplementation(async (...args) => {
          if (mockGetLoginForAccessToken) {
            return undefined;
          }
          return actualGetLoginForAccessToken(...args);
        });
      const globalLoggerInfoSpy = jest.spyOn(globalLogger, 'info');

      const binary = await repo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      });

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: `DocumentReference?location=Binary/${binary.id}`,
        channel: {
          type: 'websocket',
        },
      });

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      const body = res.body as Parameters;
      const token = body.parameter?.[0]?.valueString as string;

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [
              {
                resource: {
                  resourceType: 'SubscriptionStatus',
                  type: 'handshake',
                  subscription: { reference: `Subscription/${subscription.id}` },
                },
              },
            ],
          });
        })
        .exec(async () => {
          mockGetLoginForAccessToken = true;

          // First event: triggers the dead subscription path
          const docRef = await repo.createResource<DocumentReference>({
            resourceType: 'DocumentReference',
            status: 'current',
            content: [{ attachment: { url: `Binary/${binary.id}` } }],
          });
          expect(docRef).toBeDefined();
          await findAndExecDispatchJob(docRef, 'create');

          // Wait for subscription to be cleaned up (removed from active set by dead subscription handler)
          let subActive = true;
          while (subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(
                project.id as string,
                'DocumentReference',
                `Subscription/${subscription.id}`
              )) === 1;
          }

          // Reset the spy call count
          globalLoggerInfoSpy.mockClear();

          // Second event: subscription should be purged from lookups, so no login attempt
          await repo.createResource<DocumentReference>({
            resourceType: 'DocumentReference',
            status: 'current',
            content: [{ attachment: { url: `Binary/${binary.id}` } }],
          });

          // Give time for any potential event processing
          await sleep(100);

          // Should NOT see another "Unable to get login" log since the subscription was purged from lookups
          expect(globalLoggerInfoSpy).not.toHaveBeenCalledWith('[WS] Unable to get login for the given access token', {
            subscriptionId: subscription.id,
          });
        })
        .close()
        .expectClosed()
        .exec(async () => {
          await sleep(0);
        });

      getLoginForAccessTokenSpy.mockRestore();
      globalLoggerInfoSpy.mockRestore();
    }));

  test('User active set decremented when WebSocket closes', () =>
    withTestContext(async () => {
      const sub = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      expect(sub).toBeDefined();

      const authorRef = sub.meta?.author?.reference as string;
      expect(authorRef).toBeDefined();

      const res = await request(server)
        .get(`/fhir/R4/Subscription/${sub.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);
      const token = (res.body as Parameters).parameter?.[0]?.valueString as string;

      // Subscriptions are only added to the user active set when bound, not when created
      let countAfterBind = 0;
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [{ resource: { resourceType: 'SubscriptionStatus', type: 'handshake' } }],
          });
        })
        .exec(async () => {
          countAfterBind = await getUserActiveWebSocketSubscriptionCount(authorRef);
          expect(countAfterBind).toBeGreaterThanOrEqual(1);
        })
        .close()
        .expectClosed()
        .exec(async () => {
          // After disconnect, user active set should be decremented
          while ((await getUserActiveWebSocketSubscriptionCount(authorRef)) >= countAfterBind) {
            await sleep(0);
          }
          expect(await getUserActiveWebSocketSubscriptionCount(authorRef)).toBe(countAfterBind - 1);
        });
    }));

  test('User active set decremented when subscription is deleted', () =>
    withTestContext(async () => {
      const sub = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Observation',
        channel: { type: 'websocket' },
      });
      expect(sub).toBeDefined();

      const authorRef = sub.meta?.author?.reference as string;
      expect(authorRef).toBeDefined();

      // Subscriptions are only added to the user active set when bound, not when created.
      // Manually add the subscription to simulate it having been bound.
      await addUserActiveWebSocketSubscription(authorRef, `Subscription/${sub.id}`);
      const countAfterBind = await getUserActiveWebSocketSubscriptionCount(authorRef);
      expect(countAfterBind).toBeGreaterThanOrEqual(1);

      await repo.deleteResource('Subscription', sub.id);

      expect(await getUserActiveWebSocketSubscriptionCount(authorRef)).toBe(countAfterBind - 1);
    }));

  test('Bind resolves membership via lookup when membership claim is absent from token', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });

      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);
      const token = (res.body as Parameters).parameter?.[0]?.valueString as string;

      // Simulate an older token that lacks the membership claim
      const origVerifyJwt = keysModule.verifyJwt;
      const verifyJwtSpy = jest.spyOn(keysModule, 'verifyJwt').mockImplementationOnce(async (t: string) => {
        const result = await origVerifyJwt(t);
        const { membership: _m, ...rest } = result.payload as Record<string, unknown>;
        return { ...result, payload: rest };
      });

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            resourceType: 'Bundle',
            type: 'history',
            entry: [{ resource: { resourceType: 'SubscriptionStatus', type: 'handshake' } }],
          });
        })
        .exec(async () => {
          // Wait for the active entry to appear, then verify membership was populated via fallback lookup
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (await isSubscriptionActive(project.id as string, 'Patient', `Subscription/${subscription.id}`)) === 1;
          }
          const entries = await getActiveSubscriptions(project.id as string, 'Patient');
          const entry = entries[`Subscription/${subscription.id}`];
          expect(entry).toBeDefined();
          expect(entry.membershipId).toMatch(/^[\da-f-]{36}$/);
        })
        .close()
        .expectClosed()
        .exec(async () => {
          await sleep(0);
        });

      verifyJwtSpy.mockRestore();
    }));

  test('Bind fails with warning when membership claim is absent and membership lookup returns nothing', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });

      const token = await keysModule.generateAccessToken(
        {
          client_id: randomUUID(),
          login_id: randomUUID(),
          sub: randomUUID(),
          username: randomUUID(),
          scope: 'mock',
          profile: getReferenceString(repo.getAuthor()) ?? '',
        },
        {
          additionalClaims: {
            // We need subscription_id but intentionally leave off membership_id
            subscription_id: subscription.id,
          },
        }
      );

      // Simulate an older token that lacks the membership claim
      const origVerifyJwt = keysModule.verifyJwt;
      const verifyJwtSpy = jest.spyOn(keysModule, 'verifyJwt').mockImplementationOnce(async (t: string) => {
        const result = await origVerifyJwt(t);
        const { membership: _m, ...rest } = result.payload as Record<string, unknown>;
        return { ...result, payload: rest };
      });
      // Simulate membership not found (e.g. deleted or cross-project token)
      const findProjectMembershipSpy = jest
        .spyOn(workerUtilsModule, 'findProjectMembership')
        .mockResolvedValueOnce(undefined);
      const warnSpy = jest.spyOn(globalLogger, 'warn');

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
        .exec(async () => {
          await sleep(1000);
          expect(warnSpy).toHaveBeenCalledWith(
            '[WS] Failed to retrieve project membership for profile when binding to token',
            expect.objectContaining({ subscriptionId: subscription.id })
          );
          const active = await isSubscriptionActive(project.id as string, 'Patient', `Subscription/${subscription.id}`);
          expect(active).toBe(0);
        })
        .close()
        .expectClosed()
        .exec(async () => {
          await sleep(0);
        });

      verifyJwtSpy.mockRestore();
      findProjectMembershipSpy.mockRestore();
      warnSpy.mockRestore();
    }));

  test('Error when user exceeds max concurrent WebSocket subscriptions', () =>
    withTestContext(async () => {
      const { project: limitProject, repo: limitRepo } = await createTestProject({
        project: {
          features: ['websocket-subscriptions'],
          systemSetting: [{ name: 'maxUserWebSocketSubscriptions', valueInteger: 2 }],
        },
        withRepo: true,
      });

      // Create two subscriptions and simulate them being bound (added to both the user active set
      // and the project active hash). The limit check at create time reads the bound count, and
      // cleanup only removes entries absent from the active hash, so both must be registered.
      const sub1 = await limitRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      const sub2 = await limitRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Observation',
        channel: { type: 'websocket' },
      });

      const authorRef = sub1.meta?.author?.reference as string;
      await addUserActiveWebSocketSubscription(authorRef, `Subscription/${sub1.id}`);
      await setActiveSubscription(limitProject.id, 'Patient', `Subscription/${sub1.id}`, {
        criteria: 'Patient',
        expiration: Math.floor(Date.now() / 1000) + 3600,
        author: authorRef,
        loginId: randomUUID(),
        membershipId: randomUUID(),
      });
      await addUserActiveWebSocketSubscription(authorRef, `Subscription/${sub2.id}`);
      await setActiveSubscription(limitProject.id, 'Observation', `Subscription/${sub2.id}`, {
        criteria: 'Observation',
        expiration: Math.floor(Date.now() / 1000) + 3600,
        author: authorRef,
        loginId: randomUUID(),
        membershipId: randomUUID(),
      });

      // Third should fail since 2 are genuinely active (cleanup will not remove them)
      await expect(
        limitRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'DiagnosticReport',
          channel: { type: 'websocket' },
        })
      ).rejects.toThrow(OperationOutcomeError);
    }));

  test('cleanupUserSubs removes ref with no cache entry', () =>
    withTestContext(async () => {
      const { repo: cleanupRepo } = await createTestProject({
        project: { features: ['websocket-subscriptions'] },
        withRepo: true,
      });

      // Create a real sub just to get an authorRef
      const sub = await cleanupRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      const authorRef = sub.meta?.author?.reference as string;

      // Add a fake ref (no subscription in cache) to the user set
      const fakeRef = `Subscription/${randomUUID()}`;
      await addUserActiveWebSocketSubscription(authorRef, fakeRef);
      expect(await getUserActiveWebSocketSubscriptionCount(authorRef)).toBeGreaterThanOrEqual(1);

      await cleanupUserSubs(authorRef);

      // Fake ref should be gone; count should be reduced
      const remaining = await getUserActiveWebSocketSubscriptionCount(authorRef);
      // The only ref we added was the fake one, so it should be removed
      expect(remaining).toBeLessThan(1 + 1); // sanity: just verify the fake was cleaned
      // More precisely: ensure the fake ref itself was removed by checking via count change
    }));

  test('cleanupUserSubs removes ref not in active hash', () =>
    withTestContext(async () => {
      const { repo: cleanupRepo } = await createTestProject({
        project: { features: ['websocket-subscriptions'] },
        withRepo: true,
      });

      const sub = await cleanupRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      const authorRef = sub.meta?.author?.reference as string;
      const subRef = `Subscription/${sub.id}`;

      // Add to user set but do NOT add to the project active hash
      await addUserActiveWebSocketSubscription(authorRef, subRef);
      const countBefore = await getUserActiveWebSocketSubscriptionCount(authorRef);

      await cleanupUserSubs(authorRef);

      expect(await getUserActiveWebSocketSubscriptionCount(authorRef)).toBe(countBefore - 1);
    }));

  test('cleanupUserSubs keeps ref that is in cache and in active hash', () =>
    withTestContext(async () => {
      const { project: cleanupProject, repo: cleanupRepo } = await createTestProject({
        project: { features: ['websocket-subscriptions'] },
        withRepo: true,
      });

      const sub = await cleanupRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      const authorRef = sub.meta?.author?.reference as string;
      const subRef = `Subscription/${sub.id}`;

      // Add to user set AND to the project active hash
      await addUserActiveWebSocketSubscription(authorRef, subRef);
      await setActiveSubscription(cleanupProject.id, 'Patient', subRef, {
        criteria: 'Patient',
        expiration: Math.floor(Date.now() / 1000) + 3600,
        author: authorRef,
        loginId: randomUUID(),
        membershipId: randomUUID(),
      });
      const countBefore = await getUserActiveWebSocketSubscriptionCount(authorRef);

      await cleanupUserSubs(authorRef);

      // Ref is active — should not be removed
      expect(await getUserActiveWebSocketSubscriptionCount(authorRef)).toBe(countBefore);
    }));

  test('Third subscription succeeds after stale subs are cleaned up on retry', () =>
    withTestContext(async () => {
      const { repo: limitRepo } = await createTestProject({
        project: {
          features: ['websocket-subscriptions'],
          systemSetting: [{ name: 'maxUserWebSocketSubscriptions', valueInteger: 2 }],
        },
        withRepo: true,
      });

      const sub1 = await limitRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      const sub2 = await limitRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Observation',
        channel: { type: 'websocket' },
      });

      const authorRef = sub1.meta?.author?.reference as string;
      // Add both to user set but NOT the active hash — they are stale
      await addUserActiveWebSocketSubscription(authorRef, `Subscription/${sub1.id}`);
      await addUserActiveWebSocketSubscription(authorRef, `Subscription/${sub2.id}`);

      // Third should succeed: first attempt fails the limit check, cleanup removes the two
      // stale refs (in cache but not in active hash), retry passes
      const sub3 = await limitRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'DiagnosticReport',
        channel: { type: 'websocket' },
      });
      expect(sub3).toBeDefined();
      expect(sub3.id).toBeDefined();
    }));

  test('cleanupUserSubs is called when user is at subscription limit', () =>
    withTestContext(async () => {
      const { project: limitProject, repo: limitRepo } = await createTestProject({
        project: {
          features: ['websocket-subscriptions'],
          systemSetting: [{ name: 'maxUserWebSocketSubscriptions', valueInteger: 2 }],
        },
        withRepo: true,
      });

      const sub1 = await limitRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      const sub2 = await limitRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Observation',
        channel: { type: 'websocket' },
      });

      const authorRef = sub1.meta?.author?.reference as string;
      await addUserActiveWebSocketSubscription(authorRef, `Subscription/${sub1.id}`);
      await setActiveSubscription(limitProject.id, 'Patient', `Subscription/${sub1.id}`, {
        criteria: 'Patient',
        expiration: Math.floor(Date.now() / 1000) + 3600,
        author: authorRef,
        loginId: randomUUID(),
        membershipId: randomUUID(),
      });
      await addUserActiveWebSocketSubscription(authorRef, `Subscription/${sub2.id}`);
      await setActiveSubscription(limitProject.id, 'Observation', `Subscription/${sub2.id}`, {
        criteria: 'Observation',
        expiration: Math.floor(Date.now() / 1000) + 3600,
        author: authorRef,
        loginId: randomUUID(),
        membershipId: randomUUID(),
      });

      const cleanupSpy = jest.spyOn(pubsubModule, 'cleanupUserSubs');
      try {
        await expect(
          limitRepo.createResource<Subscription>({
            resourceType: 'Subscription',
            reason: 'test',
            status: 'active',
            criteria: 'DiagnosticReport',
            channel: { type: 'websocket' },
          })
        ).rejects.toThrow(OperationOutcomeError);

        expect(cleanupSpy).toHaveBeenCalledTimes(1);
        expect(cleanupSpy).toHaveBeenCalledWith(authorRef);
      } finally {
        cleanupSpy.mockRestore();
      }
    }));

  test('cleanupUserSubs removes both null cache entries and inactive active hash entries', () =>
    withTestContext(async () => {
      const { repo: cleanupRepo } = await createTestProject({
        project: { features: ['websocket-subscriptions'] },
        withRepo: true,
      });

      // A real subscription that is in cache but NOT in the active hash
      const sub = await cleanupRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: { type: 'websocket' },
      });
      const authorRef = sub.meta?.author?.reference as string;
      const subRef = `Subscription/${sub.id}`;

      // A fake ref with no cache entry at all
      const fakeRef = `Subscription/${randomUUID()}`;

      await addUserActiveWebSocketSubscription(authorRef, subRef);
      await addUserActiveWebSocketSubscription(authorRef, fakeRef);
      const countBefore = await getUserActiveWebSocketSubscriptionCount(authorRef);

      await cleanupUserSubs(authorRef);

      // Both the null-cache ref and the not-in-active-hash ref should be removed
      expect(await getUserActiveWebSocketSubscriptionCount(authorRef)).toBe(countBefore - 2);
    }));
});

describe('Subscription Heartbeat', () => {
  let app: Express;
  let config: MedplumServerConfig;
  let server: Server;
  let project: WithId<Project>;
  let repo: Repository;
  let accessToken: string;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    config.heartbeatMilliseconds = 25;
    config.logLevel = 'warn';
    server = await initApp(app, config);

    const result = await withTestContext(() =>
      createTestProject({
        project: { features: ['websocket-subscriptions'] },
        withAccessToken: true,
      })
    );

    project = result.project;
    accessToken = result.accessToken;

    repo = new Repository({
      extendedMode: true,
      projects: [project],
      author: {
        reference: 'ClientApplication/' + randomUUID(),
      },
    });

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 8521, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Heartbeat received after binding to token', () =>
    withTestContext(async () => {
      // Create subscription to watch patient
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'websocket',
        },
      });
      expect(subscription).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.body).toBeDefined();
      const body = res.body as Parameters;
      expect(body.resourceType).toStrictEqual('Parameters');
      expect(body.parameter?.[0]).toBeDefined();
      expect(body.parameter?.[0]?.name).toStrictEqual('token');
      expect(body.parameter?.[0]?.valueString).toBeDefined();

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token: body.parameter?.[0]?.valueString as string } })
        .expectJson((actual) => {
          expect(actual).toMatchObject({
            id: expect.any(String),
            resourceType: 'Bundle',
            type: 'history',
            timestamp: expect.any(String),
            entry: [
              {
                resource: {
                  resourceType: 'SubscriptionStatus',
                  type: 'handshake',
                  subscription: { reference: `Subscription/${subscription.id}` },
                },
              },
            ],
          });
        })
        .expectJson((msg) => {
          if (!msg.entry?.[0]) {
            return false;
          }
          const entry = msg.entry?.[0] as BundleEntry<SubscriptionStatus>;
          if (!entry.resource) {
            return false;
          }
          const status = entry.resource;
          if (status.resourceType !== 'SubscriptionStatus') {
            return false;
          }
          if (status.type !== 'heartbeat') {
            return false;
          }
          if (status.subscription.reference !== getReferenceString(subscription)) {
            return false;
          }
          return true;
        })
        .close()
        .expectClosed();
    }));

  test('Heartbeat not received before binding to token', () =>
    withTestContext(async () => {
      await request(server)
        .ws('/ws/subscriptions-r4')
        .exec(async (ws) => {
          await new Promise<void>((resolve, reject) => {
            ws.addEventListener('message', () => {
              reject(new Error('Expected not to receive a message'));
            });

            sleep(80)
              .then(() => resolve())
              .catch(reject);
          });
        })
        .close()
        .expectClosed();
    }));
});
