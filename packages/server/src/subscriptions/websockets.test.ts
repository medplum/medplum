import { ContentType, OperationOutcomeError, WithId, getReferenceString, sleep } from '@medplum/core';
import {
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
import express, { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
import { Repository } from '../fhir/repo';
import * as rewriteModule from '../fhir/rewrite';
import { RewriteMode } from '../fhir/rewrite';
import { globalLogger } from '../logger';
import * as keysModule from '../oauth/keys';
import * as oauthUtilsModule from '../oauth/utils';
import { getRedis } from '../redis';
import { createTestProject, withTestContext } from '../test.setup';

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
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (
                await getRedis().smismember(
                  `medplum:subscriptions:r4:project:${project.id}:active`,
                  `Subscription/${patientSubscription?.id}`
                )
              )[0] === 1;
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
      let subActive = true;
      while (subActive) {
        await sleep(0);
        subActive =
          (
            await getRedis().smismember(
              `medplum:subscriptions:r4:project:${project.id}:active`,
              `Subscription/${patientSubscription?.id}`
            )
          )[0] === 1;
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
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (
                await getRedis().smismember(
                  `medplum:subscriptions:r4:project:${project.id}:active`,
                  `Subscription/${patientSubscription?.id}`
                )
              )[0] === 1;
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
              (
                await getRedis().smismember(
                  `medplum:subscriptions:r4:project:${project.id}:active`,
                  `Subscription/${patientSubscription?.id}`
                )
              )[0] === 1;
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

  test('Should respond with a pong if sent a ping', () =>
    withTestContext(async () => {
      await request(server)
        .ws('/ws/subscriptions-r4')
        .sendJson({ type: 'ping' })
        .expectJson({ type: 'pong' })
        .close()
        .expectClosed();
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
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (
                await getRedis().smismember(
                  `medplum:subscriptions:r4:project:${project.id}:active`,
                  `Subscription/${subscription.id}`
                )
              )[0] === 1;
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
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (
                await getRedis().smismember(
                  `medplum:subscriptions:r4:project:${project.id}:active`,
                  `Subscription/${subscription.id}`
                )
              )[0] === 1;
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
      // Import the module to mock
      const originalGetLoginForAccessToken = oauthUtilsModule.getLoginForAccessToken;
      let mockGetLoginForAccessToken = false;
      const getLoginForAccessTokenSpy = jest
        .spyOn(oauthUtilsModule, 'getLoginForAccessToken')
        .mockImplementation(async (...args) => {
          if (mockGetLoginForAccessToken) {
            return undefined; // Return undefined auth state
          }
          return originalGetLoginForAccessToken(...args);
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
          let subActive = false;
          while (!subActive) {
            await sleep(0);
            subActive =
              (
                await getRedis().smismember(
                  `medplum:subscriptions:r4:project:${project.id}:active`,
                  `Subscription/${subscription.id}`
                )
              )[0] === 1;
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

      expect(globalLoggerInfoSpy).toHaveBeenCalledWith('[WS] Unable to get login for the given access token', {
        subscriptionId: expect.any(String),
      });

      // Restore original implementations
      getLoginForAccessTokenSpy.mockRestore();
      globalLoggerInfoSpy.mockRestore();
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
