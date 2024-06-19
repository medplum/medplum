import { OperationOutcomeError, getReferenceString, sleep } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  Parameters,
  Patient,
  Project,
  Subscription,
  SubscriptionStatus,
} from '@medplum/fhirtypes';
import express, { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { MedplumServerConfig, loadTestConfig } from '../config';
import { Repository } from '../fhir/repo';
import { getRedis } from '../redis';
import { createTestProject, withTestContext } from '../test.setup';

jest.mock('hibp');

describe('WebSockets Subscriptions', () => {
  let app: Express;
  let config: MedplumServerConfig;
  let server: Server;
  let project: Project;
  let repo: Repository;
  let accessToken: string;
  let patientSubscription: Subscription;

  beforeAll(async () => {
    console.log = jest.fn();
    app = express();
    config = await loadTestConfig();
    config.heartbeatEnabled = false;
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
      server.listen(0, 'localhost', 511, resolve);
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
      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter?.[0]).toBeDefined();
      expect(body.parameter?.[0]?.name).toEqual('token');
      expect(body.parameter?.[0]?.valueString).toBeDefined();

      const token = body.parameter?.[0]?.valueString as string;

      let version2: Patient;
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
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
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (
                await getRedis().smismember(
                  `medplum:subscriptions:r4:project:${project.id}:active`,
                  `Subscription/${patientSubscription?.id as string}`
                )
              )[0] === 1;
          }
          expect(subActive).toEqual(true);
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
      let subActive = true;
      while (subActive) {
        await sleep(0);
        subActive =
          (
            await getRedis().smismember(
              `medplum:subscriptions:r4:project:${project.id}:active`,
              `Subscription/${patientSubscription?.id as string}`
            )
          )[0] === 1;
      }
      expect(subActive).toEqual(false);

      // Check Patient subscription is NOT still in the cache
      await expect(repo.readResource<Subscription>('Subscription', patientSubscription?.id as string)).rejects.toThrow(
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
      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter?.[0]).toBeDefined();
      expect(body.parameter?.[0]?.name).toEqual('token');
      expect(body.parameter?.[0]?.valueString).toBeDefined();

      const token = body.parameter?.[0]?.valueString as string;

      let version2: Patient;
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token } })
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
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (
                await getRedis().smismember(
                  `medplum:subscriptions:r4:project:${project.id}:active`,
                  `Subscription/${patientSubscription?.id as string}`
                )
              )[0] === 1;
          }
          expect(subActive).toEqual(true);
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
              (
                await getRedis().smismember(
                  `medplum:subscriptions:r4:project:${project.id}:active`,
                  `Subscription/${patientSubscription?.id as string}`
                )
              )[0] === 1;
          }
          expect(subActive).toEqual(false);
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
});

describe('Subscription Heartbeat', () => {
  let app: Express;
  let config: MedplumServerConfig;
  let server: Server;
  let project: Project;
  let repo: Repository;
  let accessToken: string;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    config.heartbeatMilliseconds = 25;
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
      projects: [project.id as string],
      author: {
        reference: 'ClientApplication/' + randomUUID(),
      },
    });

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, resolve);
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
      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter?.[0]).toBeDefined();
      expect(body.parameter?.[0]?.name).toEqual('token');
      expect(body.parameter?.[0]?.valueString).toBeDefined();

      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'bind-with-token', payload: { token: body.parameter?.[0]?.valueString as string } })
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
