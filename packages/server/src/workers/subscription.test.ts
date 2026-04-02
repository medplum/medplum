// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { SearchRequest, WithId } from '@medplum/core';
import {
  ContentType,
  LogLevel,
  Operator,
  createReference,
  generateId,
  getReferenceString,
  stringify,
} from '@medplum/core';
import type {
  AccessPolicy,
  AuditEvent,
  Binary,
  Bot,
  DocumentReference,
  Observation,
  Patient,
  Project,
  ProjectMembership,
  Resource,
  ResourceType,
  Subscription,
} from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import type { Job, Worker } from 'bullmq';
import * as bullmqModule from 'bullmq';
import type { Redis } from 'ioredis';
import fetch from 'node-fetch';
import { createHmac, randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { tryGetRequestContext } from '../context';
import type { SystemRepository } from '../fhir/repo';
import { Repository } from '../fhir/repo';
import * as loggerModule from '../logger';
import { globalLogger } from '../logger';
import * as otelModule from '../otel/otel';
import {
  addUserActiveWebSocketSubscription,
  getActiveSubscriptions,
  getUserActiveWebSocketSubscriptionCount,
  setActiveSubscription,
} from '../pubsub';
import { getPubSubRedisSubscriber } from '../redis';
import type { SubEventsOptions } from '../subscriptions/websockets';
import { createTestProject, withTestContext } from '../test.setup';
import { AuditEventOutcome } from '../util/auditevent';
import type { SubscriptionJobData } from './subscription';
import { addSubscriptionJobs, execSubscriptionJob, initSubscriptionWorker } from './subscription';
import { findAndExecDispatchJob, findAndExecSubscriptionJob } from './test-utils';
import * as workerUtils from './utils';

jest.mock('node-fetch');
const mockBullmq = jest.mocked(bullmqModule);

describe('Subscription Worker', () => {
  let systemRepo: SystemRepository;
  let repo: Repository;
  let botRepo: Repository;
  let mockLambdaClient: AwsClientStub<LambdaClient>;
  let superAdminRepo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(async () => {
    (fetch as unknown as jest.Mock).mockClear();

    // Create one simple project with no advanced features enabled
    const { client, repo: _repo } = await withTestContext(() =>
      createTestProject({
        withClient: true,
        withRepo: true,
        project: {
          name: 'Test Project',
          features: [],
        },
      })
    );

    repo = _repo;
    systemRepo = repo.getSystemRepo();
    superAdminRepo = new Repository({ extendedMode: true, superAdmin: true, author: createReference(client) });

    // Create another project, this one with bots enabled
    const botProjectDetails = await createTestProject({ withClient: true });
    botRepo = new Repository({
      extendedMode: true,
      projects: [botProjectDetails.project],
      author: createReference(botProjectDetails.client),
      currentProject: botProjectDetails.project,
    });

    mockLambdaClient = mockClient(LambdaClient);
    mockLambdaClient.on(InvokeCommand).callsFake(({ Payload }) => {
      const decoder = new TextDecoder();
      const event = JSON.parse(decoder.decode(Payload));
      const output = typeof event.input === 'string' ? event.input : JSON.stringify(event.input);
      const encoder = new TextEncoder();

      return {
        LogResult: `U1RBUlQgUmVxdWVzdElkOiAxNDZmY2ZjZi1jMzJiLTQzZjUtODJhNi1lZTBmMzEzMmQ4NzMgVmVyc2lvbjogJExBVEVTVAoyMDIyLTA1LTMwVDE2OjEyOjIyLjY4NVoJMTQ2ZmNmY2YtYzMyYi00M2Y1LTgyYTYtZWUwZjMxMzJkODczCUlORk8gdGVzdApFTkQgUmVxdWVzdElkOiAxNDZmY2ZjZi1jMzJiLTQzZjUtODJhNi1lZTBmMzEzMmQ4NzMKUkVQT1JUIFJlcXVlc3RJZDogMTQ2ZmNmY2YtYzMyYi00M2Y1LTgyYTYtZWUwZjMxMzJkODcz`,
        Payload: encoder.encode(output),
      };
    });
  });

  afterEach(() => {
    mockLambdaClient.restore();
  });

  test('Send subscriptions', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient, 'create');

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: stringify(patient),
        })
      );

      // Update the patient
      await repo.updateResource({ ...patient, active: true });

      await findAndExecSubscriptionJob(patient, 'update');

      // Delete the patient
      await repo.deleteResource('Patient', patient.id);

      await findAndExecSubscriptionJob(patient, 'delete');
    }));

  test('Status code 201', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 201 }));

      await findAndExecSubscriptionJob(patient, 'create');

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: stringify(patient),
        })
      );
    }));

  test('Send subscription with custom headers', () =>
    withTestContext(
      async () => {
        const url = 'https://example.com/subscription';

        const subscription = await repo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'rest-hook',
            endpoint: url,
            header: ['Authorization: Basic xyz'],
          },
        });
        expect(subscription).toBeDefined();

        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

        (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

        await findAndExecSubscriptionJob(patient, 'create');

        expect(fetch).toHaveBeenCalledWith(
          url,
          expect.objectContaining({
            method: 'POST',
            body: stringify(patient),
            headers: {
              'Content-Type': ContentType.FHIR_JSON,
              Authorization: 'Basic xyz',
              'x-trace-id': '00-12345678901234567890123456789012-3456789012345678-01',
              traceparent: '00-12345678901234567890123456789012-3456789012345678-01',
              'X-Medplum-Subscription': subscription.id,
              'X-Medplum-Interaction': 'create',
            },
          })
        );
      },
      { traceId: '00-12345678901234567890123456789012-3456789012345678-01' }
    ));

  test('Create-only subscription', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
            valueCode: 'create',
          },
        ],
      });
      expect(subscription).toBeDefined();

      // Create the patient
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient, 'create');

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: stringify(patient),
        })
      );

      // Update the patient
      await repo.updateResource({ ...patient, active: true });

      // Update should not trigger the subscription
      await expect(findAndExecSubscriptionJob(patient, 'update')).rejects.toThrow('Job not found');

      // Delete the patient
      await repo.deleteResource('Patient', patient.id);

      await expect(findAndExecSubscriptionJob(patient, 'update')).rejects.toThrow('Job not found');
    }));

  test('Delete-only subscription', () =>
    withTestContext(
      async () => {
        const url = 'https://example.com/subscription';
        const secret = randomUUID();

        const subscription = await repo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'rest-hook',
            endpoint: url,
          },
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
              valueCode: 'delete',
            },
            {
              url: 'https://www.medplum.com/fhir/StructureDefinition/subscription-secret',
              valueString: secret,
            },
          ],
        });
        expect(subscription).toBeDefined();

        // Create the patient
        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

        // Create should trigger the subscription
        await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');

        // Update the patient
        await repo.updateResource({ ...patient, active: true });

        // Update should not trigger the subscription
        await expect(findAndExecSubscriptionJob(patient, 'update')).rejects.toThrow('Job not found');

        // Delete the patient
        await repo.deleteResource('Patient', patient.id);

        await findAndExecSubscriptionJob(patient, 'delete');
        expect(fetch).toHaveBeenCalledWith(
          url,
          expect.objectContaining({
            method: 'POST',
            body: '{}',
            headers: {
              'Content-Type': ContentType.FHIR_JSON,
              'X-Medplum-Subscription': subscription.id,
              'X-Medplum-Interaction': 'delete',
              'X-Medplum-Deleted-Resource': `Patient/${patient.id}`,
              'X-Signature': createHmac('sha256', secret).update('{}').digest('hex'),
              'x-trace-id': '00-12345678901234567890123456789012-3456789012345678-01',
              traceparent: '00-12345678901234567890123456789012-3456789012345678-01',
            },
          })
        );
      },
      { traceId: '00-12345678901234567890123456789012-3456789012345678-01' }
    ));

  test('Send subscriptions with signature', () =>
    withTestContext(
      async () => {
        const url = 'https://example.com/subscription';
        const secret = '0123456789';

        const subscription = await repo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'rest-hook',
            endpoint: url,
          },
          extension: [
            {
              url: 'https://www.medplum.com/fhir/StructureDefinition/subscription-secret',
              valueString: secret,
            },
          ],
        });
        expect(subscription).toBeDefined();

        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

        (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

        const body = stringify(patient);
        const signature = createHmac('sha256', secret).update(body).digest('hex');

        await findAndExecSubscriptionJob(patient, 'create');

        expect(fetch).toHaveBeenCalledWith(
          url,
          expect.objectContaining({
            method: 'POST',
            body,
            headers: {
              'Content-Type': ContentType.FHIR_JSON,
              'X-Signature': signature,
              'x-trace-id': '00-12345678901234567890123456789012-3456789012345678-01',
              traceparent: '00-12345678901234567890123456789012-3456789012345678-01',
              'X-Medplum-Subscription': subscription.id,
              'X-Medplum-Interaction': 'create',
            },
          })
        );
      },
      { traceId: '00-12345678901234567890123456789012-3456789012345678-01' }
    ));

  test('Send subscriptions with legacy signature extension', () =>
    withTestContext(
      async () => {
        const url = 'https://example.com/subscription';
        const secret = '0123456789';

        const subscription = await repo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'rest-hook',
            endpoint: url,
          },
          extension: [
            {
              url: 'https://www.medplum.com/fhir/StructureDefinition-subscriptionSecret',
              valueString: secret,
            },
          ],
        });
        expect(subscription).toBeDefined();

        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

        (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

        const body = stringify(patient);
        const signature = createHmac('sha256', secret).update(body).digest('hex');

        await findAndExecSubscriptionJob(patient, 'create');

        expect(fetch).toHaveBeenCalledWith(
          url,
          expect.objectContaining({
            method: 'POST',
            body,
            headers: {
              'Content-Type': ContentType.FHIR_JSON,
              'X-Signature': signature,
              'x-trace-id': '00-12345678901234567890123456789012-3456789012345678-01',
              traceparent: '00-12345678901234567890123456789012-3456789012345678-01',
              'X-Medplum-Subscription': subscription.id,
              'X-Medplum-Interaction': 'create',
            },
          })
        );
      },
      { traceId: '00-12345678901234567890123456789012-3456789012345678-01' }
    ));

  test('Ignore non-subscription subscriptions', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'email', // this is what causes the subscription to be ignored
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');
    }));

  test('Ignore subscriptions missing URL', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: '',
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');
    }));

  // Skip test
  test.skip('Ignore subscriptions with missing criteria', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      } as Subscription);
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');
    }));

  test('Ignore subscriptions with different criteria resource type', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Observation',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');
    }));

  test('Ignore subscriptions with different criteria parameter', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Observation?status=final',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      });
      expect(subscription).toBeDefined();

      const obs1 = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'preliminary',
        code: { text: 'ok' },
      });

      await expect(findAndExecSubscriptionJob(obs1, 'create')).rejects.toThrow('Job not found');

      const obs2 = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'ok' },
      });

      await findAndExecSubscriptionJob(obs2, 'create');
    }));

  test('Ignore disabled subscriptions', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'off',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');
    }));

  test('Ignore resource changes in different project', () =>
    withTestContext(async () => {
      // Create a subscription in project 1
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      });
      expect(subscription).toBeDefined();

      // Create a patient in project 2
      const patient = await botRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');
    }));

  test('Ignore resource changes in different account compartment', () =>
    withTestContext(async () => {
      const project = randomUUID();
      const account = 'Organization/' + randomUUID();

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        meta: {
          project,
          account: {
            reference: account,
          },
        },
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project,
        },
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');
    }));

  test.skip('Retries in preamble errors', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-max-attempts',
            valueInteger: 3,
          },
        ],
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      // causes an error to be thrown
      const getLoggerSpy = jest.spyOn(loggerModule, 'getLogger').mockImplementation(() => {
        throw new Error('Logger not available for some weird reason');
      });

      // On the first attempt, throws
      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow(
        'Logger not available for some weird reason'
      );

      // On a later attempt, should not throw
      await findAndExecSubscriptionJob(patient, 'create');

      getLoggerSpy.mockRestore();
    }));

  test('Retry on 429', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-max-attempts',
            valueInteger: 3,
          },
        ],
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock)
        .mockImplementationOnce(() => ({ status: 429 }))
        .mockImplementationOnce(() => ({ status: 429 }))
        .mockImplementation(() => ({ status: 200 }));

      // If the job throws, then the QueueScheduler will retry
      const jobs = await findAndExecSubscriptionJob(patient, 'create');
      expect(jobs.length).toStrictEqual(3);
      expect(jobs[0].changePriority).toHaveBeenCalledWith({ priority: 1 });
      expect(jobs[1].changePriority).toHaveBeenCalledWith({ priority: 2 });
      expect(jobs[2].changePriority).not.toHaveBeenCalled();
    }));

  test('Retry on exception', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-max-attempts',
            valueInteger: 3,
          },
        ],
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('foo');
        })
        .mockImplementation(() => ({ status: 200 }));

      // If the job throws, then the QueueScheduler will retry
      const jobs = await findAndExecSubscriptionJob(patient, 'create');
      expect(jobs.length).toStrictEqual(2);
      expect(jobs[0].changePriority).toHaveBeenCalledWith({ priority: 1 });
      expect(jobs[1].changePriority).not.toHaveBeenCalled();
    }));

  test('Do not throw after max job attempts', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-max-attempts',
            valueInteger: 1,
          },
        ],
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock).mockImplementation(() => {
        throw new Error();
      });

      // Job shouldn't throw after max attempts, which will cause it to not retry
      const jobs = await findAndExecSubscriptionJob(patient, 'create');
      expect(jobs.length).toStrictEqual(2);
      expect(jobs[0].changePriority).toHaveBeenCalledWith({ priority: 1 });
      expect(jobs[1].changePriority).not.toHaveBeenCalled();
    }));

  test('Ignore bots if feature not enabled', () =>
    withTestContext(async () => {
      const nonce = randomUUID();

      const bot = await repo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'Test Bot',
        description: 'Test Bot',
        runtimeVersion: 'awslambda',
        code: `
        export async function handler(medplum, event) {
          console.log('${nonce}');
          return event.input;
        }
      `,
      });

      await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: { reference: 'Project/' + bot.meta?.project },
        user: createReference(bot),
        profile: createReference(bot),
      });

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: getReferenceString(bot as Bot),
        },
      });

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient, 'create');

      const bundle = await repo.search<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toStrictEqual(1);

      const auditEvent = bundle.entry?.[0]?.resource as AuditEvent;
      expect(auditEvent.outcomeDesc).toStrictEqual('Bots not enabled');
      expect(auditEvent.period).toBeDefined();
      expect(auditEvent.entity).toHaveLength(3);
    }));

  test('Execute bot subscriptions', () =>
    withTestContext(async () => {
      const bot = await botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'Test Bot',
        description: 'Test Bot',
        runtimeVersion: 'awslambda',
        code: `
        export async function handler(medplum, event) {
          return event.input;
        }
      `,
      });

      await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: { reference: 'Project/' + bot.meta?.project },
        user: createReference(bot),
        profile: createReference(bot),
      });

      const subscription = await botRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: getReferenceString(bot as Bot),
        },
      });

      const patient = await botRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient, 'create');
      expect(fetch).not.toHaveBeenCalled();

      const bundle = await botRepo.search<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toStrictEqual(1);
      expect(bundle.entry?.[0]?.resource?.outcome).toStrictEqual('0');
    }));

  test('Execute bot subscriptions run as user', () =>
    withTestContext(async () => {
      const bot = await botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'Test Bot',
        description: 'Test Bot',
        runAsUser: true,
        runtimeVersion: 'awslambda',
        code: `
        export async function handler(medplum, event) {
          return event.input;
        }
      `,
      });

      await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: { reference: 'Project/' + bot.meta?.project },
        user: createReference(bot),
        profile: createReference(bot),
      });

      const subscription = await botRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: getReferenceString(bot as Bot),
        },
      });

      const patient = await botRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient, 'create');
      expect(fetch).not.toHaveBeenCalled();

      const bundle = await botRepo.search<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toStrictEqual(1);
      expect(bundle.entry?.[0]?.resource?.outcome).toStrictEqual('0');
    }));

  test('Execute Bot from linked Project', () =>
    withTestContext(async () => {
      const bot = await botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'Test Bot',
        description: 'Test Bot',
        runtimeVersion: 'awslambda',
        code: `export async function handler(medplum, event) { return event.input; }`,
      });

      const { project, repo } = await createTestProject({
        withRepo: true,
        project: { link: [{ project: createReference(botRepo.currentProject() as Project) }] },
        membership: { admin: true },
      });

      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: getReferenceString(bot as Bot),
        },
      });
      const subscriptionEvents: SearchRequest<AuditEvent> = {
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      };

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      // Attempt to trigger the Subscription
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow(
        'Could not find project membership for bot'
      );
      expect(fetch).not.toHaveBeenCalled();

      // Without a project membership for the Bot, the Subscription is not triggered
      await expect(repo.search(subscriptionEvents)).resolves.toMatchObject({ entry: [] });

      // Create membership for Bot in Subscription Project
      await repo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(project),
        user: createReference(bot),
        profile: createReference(bot),
      });

      // Re-trigger the Subscription
      await repo.updateResource({ ...patient, active: true });
      await findAndExecSubscriptionJob(patient, 'update');
      expect(fetch).not.toHaveBeenCalled();

      // The Subscription should have been triggered
      const events = await repo.search(subscriptionEvents);
      expect(events.entry).toHaveLength(1);
      expect(events.entry?.[0].resource).toMatchObject<Partial<AuditEvent>>({
        resourceType: 'AuditEvent',
        outcome: '0',
      });
    }));

  test('Stop retries if Subscription status not active', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/',
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      // At this point the job should be in the queue
      // But let's change the subscription status to something else
      await repo.updateResource<Subscription>({
        ...subscription,
        status: 'off',
      });

      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');

      // Fetch should not have been called
      expect(fetch).not.toHaveBeenCalled();

      // No AuditEvent resources should have been created
      const bundle = await repo.search<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toStrictEqual(0);
    }));

  test('Stop retries if Subscription deleted', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/',
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      // At this point the job should be in the queue
      // But let's delete the subscription
      await repo.deleteResource('Subscription', subscription.id);

      await expect(findAndExecSubscriptionJob(patient, 'create')).rejects.toThrow('Job not found');

      // Fetch should not have been called
      expect(fetch).not.toHaveBeenCalled();

      // No AuditEvent resources should have been created
      const bundle = await repo.search<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toStrictEqual(0);
    }));

  test('Stop retries if Resource deleted', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/',
        },
      });
      expect(subscription).toBeDefined();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      // At this point the job should be in the queue
      // But let's delete the resource
      await repo.deleteResource('Patient', patient.id);

      await findAndExecSubscriptionJob(patient, 'create');

      // Fetch should not have been called
      expect(fetch).not.toHaveBeenCalled();

      // No AuditEvent resources should have been created
      const bundle = await repo.search<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toStrictEqual(0);
    }));

  test('AuditEvent has Subscription account details', () =>
    withTestContext(async () => {
      const project = (await createTestProject()).project.id;
      const account = {
        reference: 'Organization/' + randomUUID(),
      };

      const subscription = await systemRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        meta: {
          project,
          account,
        },
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      });
      expect(subscription).toBeDefined();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project,
          account,
        },
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient, 'create');

      const bundle = await systemRepo.search<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toStrictEqual(1);

      const auditEvent = bundle.entry?.[0]?.resource as AuditEvent;
      expect(auditEvent.meta?.account?.reference).toStrictEqual(account.reference);
      expect(auditEvent.meta?.accounts).toHaveLength(1);
      expect(auditEvent.meta?.accounts).toContainEqual({ reference: account.reference });
      expect(auditEvent.entity).toHaveLength(2);
    }));

  test('AuditEvent outcome from custom codes', () =>
    withTestContext(async () => {
      const project = (await createTestProject()).project.id;
      const account = {
        reference: 'Organization/' + randomUUID(),
      };

      const subscription = await systemRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        meta: {
          project,
          account,
        },
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
            valueString: '200,201,410-600',
          },
        ],
      });
      expect(subscription).toBeDefined();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project,
          account,
        },
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 515 }));

      await findAndExecSubscriptionJob(patient, 'create');

      const bundle = await systemRepo.search<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      });

      expect(bundle.entry?.length).toStrictEqual(1);

      const auditEvent = bundle.entry?.[0].resource as AuditEvent;
      // Should return a successful AuditEventOutcome with a normally failing status
      expect(auditEvent.outcome).toStrictEqual(AuditEventOutcome.Success);
    }));

  test('Subscription AuditEvent destination - default behavior creates resource', () =>
    withTestContext(async () => {
      const project = (await createTestProject()).project.id;

      const subscription = await systemRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        meta: {
          project,
        },
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      });

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project,
        },
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient, 'create');

      const bundle = await systemRepo.search<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'entity',
            operator: Operator.EQUALS,
            value: getReferenceString(subscription),
          },
        ],
      });

      // Default behavior: should create one AuditEvent resource
      expect(bundle.entry?.length).toStrictEqual(1);
    }));

  describe('Subscription AuditEvent destination with logging', () => {
    let originalConsoleLog: typeof console.log;

    beforeEach(async () => {
      const config = await loadTestConfig();
      config.logAuditEvents = true;
      originalConsoleLog = console.log;
      console.log = jest.fn();
    });

    afterEach(async () => {
      console.log = originalConsoleLog;
      const config = await loadTestConfig();
      config.logAuditEvents = false;
    });

    test('log only', () =>
      withTestContext(async () => {
        const project = (await createTestProject()).project.id;

        const subscription = await systemRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          meta: {
            project,
          },
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'rest-hook',
            endpoint: 'https://example.com/subscription',
          },
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-audit-event-destination',
              valueCode: 'log',
            },
          ],
        });

        const patient = await systemRepo.createResource<Patient>({
          resourceType: 'Patient',
          meta: {
            project,
          },
          name: [{ given: ['Alice'], family: 'Smith' }],
        });

        (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

        await findAndExecSubscriptionJob(patient, 'create');

        const bundle = await systemRepo.search<AuditEvent>({
          resourceType: 'AuditEvent',
          filters: [
            {
              code: 'entity',
              operator: Operator.EQUALS,
              value: getReferenceString(subscription),
            },
          ],
        });

        // Should NOT create AuditEvent resource in DB
        expect(bundle.entry?.length).toStrictEqual(0);

        // Should log AuditEvent to console
        expect(console.log).toHaveBeenCalled();
        const loggedCall = (console.log as jest.Mock).mock.calls.find((call) => {
          try {
            const parsed = JSON.parse(call[0]);
            return parsed.resourceType === 'AuditEvent' && parsed.type?.code === 'transmit';
          } catch {
            return false;
          }
        });
        expect(loggedCall).toBeDefined();
      }));

    test('resource and log', () =>
      withTestContext(async () => {
        const project = (await createTestProject()).project.id;

        const subscription = await systemRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          meta: {
            project,
          },
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'rest-hook',
            endpoint: 'https://example.com/subscription',
          },
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-audit-event-destination',
              valueCode: 'resource',
            },
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-audit-event-destination',
              valueCode: 'log',
            },
          ],
        });

        const patient = await systemRepo.createResource<Patient>({
          resourceType: 'Patient',
          meta: {
            project,
          },
          name: [{ given: ['Alice'], family: 'Smith' }],
        });

        (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

        await findAndExecSubscriptionJob(patient, 'create');

        const bundle = await systemRepo.search<AuditEvent>({
          resourceType: 'AuditEvent',
          filters: [
            {
              code: 'entity',
              operator: Operator.EQUALS,
              value: getReferenceString(subscription),
            },
          ],
        });

        // Should create AuditEvent resource in DB
        expect(bundle.entry?.length).toStrictEqual(1);

        // Should also log AuditEvent to console
        expect(console.log).toHaveBeenCalled();
        const loggedCall = (console.log as jest.Mock).mock.calls.find((call) => {
          try {
            const parsed = JSON.parse(call[0]);
            return parsed.resourceType === 'AuditEvent' && parsed.type?.code === 'transmit';
          } catch {
            return false;
          }
        });
        expect(loggedCall).toBeDefined();
      }));
  });

  test('FhirPathCriteria extension', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
            valueString: '%previous.name!=%current.name',
          },
        ],
      });

      expect(subscription).toBeDefined();

      // Create the patient
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      // Update the patient
      const patient2 = await repo.updateResource({ ...patient, name: [{ given: ['Bob'], family: 'Smith' }] });

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient2, 'update');
      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: stringify(patient2),
        })
      );
    }));

  test('FhirPathCriteria extension not met', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
            valueString: '%previous.name=%current.name',
          },
        ],
      });

      expect(subscription).toBeDefined();

      // Create the patient
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      // Update the patient
      const patient2 = await repo.updateResource({ ...patient, name: [{ given: ['Bob'], family: 'Smith' }] });

      await expect(findAndExecSubscriptionJob(patient2, 'update')).rejects.toThrow('Job not found');
    }));

  test('Error during FhirPath evaluation should not result in other Subscriptions not firing', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';

      const subscription1 = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
            valueString:
              '%current.address.postalCode.all(%previous.address.postalCode.contains(%current.address.postalCode)).not()',
          },
        ],
      });

      // We create this subscription second so that if the loop to evaluate the subscription exits early, this subscription won't be evaluated
      const subscription2 = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
      });

      expect(subscription1).toBeDefined();
      expect(subscription2).toBeDefined();

      // Create the patient
      let patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        // Add address with multiple values, this would cause the FHIRPath expression to throw
        // since you cannot call contains on an array (must be called on a singleton)
        address: [{ postalCode: '94134' }, { postalCode: '94135' }],
      });
      expect(patient).toBeDefined();

      patient = await repo.updateResource<Patient>({
        ...patient,
        address: [{ postalCode: '94134' }, { postalCode: '94136' }],
      });
      expect(patient).toBeDefined();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await expect(findAndExecSubscriptionJob(patient, 'update', subscription1)).rejects.toThrow('Job not found');
      await findAndExecSubscriptionJob(patient, 'update', subscription2);
    }));

  test('Subscription -- Unexpected throw inside of satisfiesAccessPolicy (regression in #3978, see #4003)', () =>
    withTestContext(async () => {
      globalLogger.level = LogLevel.WARN;
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const url = 'https://example.com/subscription';

      // Create an access policy in different project
      // This should trigger an error when the subscription is executed
      const accessPolicy = await repo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Patient', readonly: false }],
      });

      const { repo: apTestRepo } = await createTestProject({
        withClient: true,
        withRepo: true,
        project: {
          name: 'AccessPolicy Throw Project',
          features: [],
        },
        membership: {
          accessPolicy: createReference(accessPolicy),
        },
      });

      const subscription = await apTestRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
      });
      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();

      // Create the patient
      const patient = await apTestRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      await systemRepo.deleteResource('AccessPolicy', accessPolicy.id);

      // Update the patient
      const patient2 = await apTestRepo.updateResource({ ...patient, name: [{ given: ['Bob'], family: 'Smith' }] });

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient2, 'update', subscription);
      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: stringify(patient2),
        })
      );

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Error occurred while checking access policy'));

      globalLogger.level = LogLevel.NONE;
      console.log = originalConsoleLog;
    }));

  // TODO: Remove this test when enforcing AccessPolicy will not break things
  test('Subscription -- Rest Hook Sub does not meet AccessPolicy', () =>
    withTestContext(async () => {
      globalLogger.level = LogLevel.WARN;
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const url = 'https://example.com/subscription';

      // Create an access policy in different project
      // This should trigger an error when the subscription is executed
      const accessPolicy = await repo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Patient', criteria: `Patient?_id=${generateId()}` }],
      });

      const { repo: apTestRepo } = await createTestProject({
        withClient: true,
        withRepo: true,
        project: {
          name: 'AccessPolicy Not Met but Should Succeed Project',
          features: [],
        },
        membership: {
          accessPolicy: createReference(accessPolicy),
        },
      });

      const subscription = await apTestRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: url,
        },
      });
      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();

      // Create the patient
      const patient = await apTestRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      // Clear the queue

      await systemRepo.deleteResource('AccessPolicy', accessPolicy.id);

      // Update the patient
      const patient2 = await apTestRepo.updateResource({ ...patient, name: [{ given: ['Bob'], family: 'Smith' }] });

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(patient2, 'update', subscription);
      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: stringify(patient2),
        })
      );

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Error occurred while checking access policy'));

      globalLogger.level = LogLevel.NONE;
      console.log = originalConsoleLog;
    }));

  test('Subscription -- Access policy is evaluated once per author across multiple matching subscriptions', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';

      // Create a fresh project with its own repo so subscriptions have a known, isolated author
      const { project, repo: testRepo } = await createTestProject({
        withClient: true,
        withRepo: true,
      });

      // Create 3 subscriptions all owned by the same author (testRepo's client)
      const subscriptions = [];
      for (let i = 0; i < 3; i++) {
        subscriptions.push(
          await testRepo.createResource<Subscription>({
            resourceType: 'Subscription',
            reason: 'test',
            status: 'active',
            criteria: 'Patient',
            channel: { type: 'rest-hook', endpoint: url },
          })
        );
      }

      const patient = await testRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      const spy = jest.spyOn(workerUtils, 'findProjectMembership');

      await addSubscriptionJobs(patient, undefined, { project, interaction: 'create' });

      // All 3 subscriptions match and share the same author, so findProjectMembership
      // should only be called once due to the per-author access policy cache.
      expect(spy).toHaveBeenCalledTimes(1);
      // All 3 subscriptions should still have been enqueued.
      for (let i = 0; i < 3; i++) {
        await findAndExecSubscriptionJob(patient, 'create', subscriptions[i]);
      }

      spy.mockRestore();
    }));

  test('Rest Hook Subscription -- Attachments are Rewritten', () =>
    withTestContext(async () => {
      const url = 'https://example.com/subscription';

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
          type: 'rest-hook',
          endpoint: url,
        },
      });
      expect(subscription).toBeDefined();

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

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      await findAndExecSubscriptionJob(documentRef, 'create', subscription);

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('?Expires='),
        })
      );
    }));

  describe('WebSocket Subscriptions', () => {
    type EventNotificationArgs<T extends Resource> = [T, string, SubEventsOptions];
    type WsSubMessage = { resource: Resource; events: [string, SubEventsOptions][] };

    let subscriber: Redis;
    let resolveExpected: ((args: EventNotificationArgs<Resource>) => void) | undefined;
    let rejectNotExpected: ((err: Error) => void) | undefined;
    let resolveExpectedFullMessage: ((message: WsSubMessage) => void) | undefined;

    beforeAll(async () => {
      subscriber = getPubSubRedisSubscriber();
      subscriber.on('message', (_channel, payload) => {
        const parsed = JSON.parse(payload) as WsSubMessage;
        if (resolveExpectedFullMessage) {
          resolveExpectedFullMessage(parsed);
          resolveExpectedFullMessage = undefined;
          return;
        }
        const args: EventNotificationArgs<Resource> = [parsed.resource, parsed.events[0][0], parsed.events[0][1]];
        if (resolveExpected) {
          resolveExpected(args);
        } else if (rejectNotExpected) {
          rejectNotExpected(new Error('Received subscription notification when not expected'));
          rejectNotExpected = undefined;
        }
      });
      await subscriber.subscribe('medplum:subscriptions:r4:websockets');
    });

    afterAll(async () => {
      await subscriber.quit();
    });

    async function assertNoWsNotifications(timeoutMs?: number): Promise<void> {
      let resolve!: () => void;
      let reject!: (err: Error) => void;
      const deferredPromise = new Promise<void>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      const notificationTimeout = setTimeout(resolve, timeoutMs ?? 1000);

      rejectNotExpected = (err: Error) => {
        clearTimeout(notificationTimeout);
        reject(err);
      };

      await deferredPromise;
    }

    async function waitForNextSubNotification<T extends Resource>(
      timeoutMs?: number
    ): Promise<EventNotificationArgs<T>> {
      let resolve!: (args: EventNotificationArgs<T>) => void;
      let reject!: (err: Error) => void;
      const deferredPromise = new Promise<EventNotificationArgs<T>>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      const notificationTimeout = setTimeout(
        () => reject(new Error('Timeout while waiting for sub notification')),
        timeoutMs ?? 1000
      );

      resolveExpected = resolve as (args: EventNotificationArgs<Resource>) => void;

      const args = await deferredPromise;
      clearTimeout(notificationTimeout);
      return args;
    }

    async function waitForNextSubMessage(timeoutMs?: number): Promise<WsSubMessage> {
      let resolve!: (message: WsSubMessage) => void;
      let reject!: (err: Error) => void;
      const deferredPromise = new Promise<WsSubMessage>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      const notificationTimeout = setTimeout(
        () => reject(new Error('Timeout while waiting for sub message')),
        timeoutMs ?? 1000
      );

      resolveExpectedFullMessage = resolve;

      const message = await deferredPromise;
      clearTimeout(notificationTimeout);
      return message;
    }

    /**
     * Simulates a WebSocket client binding to a subscription by populating the
     * pubsub active subscriptions hash.  In production this happens inside
     * `onBind` in websockets.ts; here we call the Redis helpers directly so
     * that the subscription worker can find the entry when evaluating criteria.
     * @param subscription - The Subscription to simulate binding to.
     * @param projectId - The project ID the Subscription belongs to.
     * @returns A Promise that resolves to the reference string of the author.
     */
    async function bindSubscription(subscription: WithId<Subscription>, projectId: string): Promise<string> {
      const authorRef = subscription.meta?.author?.reference ?? 'Practitioner/test-author';
      const criteria = subscription.criteria ?? '*';
      const criteriaResourceType = criteria.split('?')[0] as ResourceType;
      const subRef = `Subscription/${subscription.id}`;
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      await addUserActiveWebSocketSubscription(authorRef, subRef);
      await setActiveSubscription(projectId, criteriaResourceType, subRef, {
        criteria,
        expiration,
        author: authorRef,
        loginId: randomUUID(),
        membershipId: randomUUID(),
      });
      return authorRef;
    }

    test('Enabled', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WebSocket Subs Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        const subscription = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient?name=Alice',
          channel: {
            type: 'websocket',
          },
        });
        expect(subscription).toBeDefined();
        expect(subscription.id).toBeDefined();

        await bindSubscription(subscription, wsProject.id);

        let nextArgsPromise = waitForNextSubNotification<Patient>();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });

        expect(patient).toBeDefined();
        await findAndExecDispatchJob(patient, 'create');

        let notificationArgs = await nextArgsPromise;
        expect(notificationArgs).toMatchObject<EventNotificationArgs<Patient>>([
          expect.objectContaining(patient),
          subscription.id,
          { includeResource: true },
        ]);

        // Update the patient
        nextArgsPromise = waitForNextSubNotification<Patient>();
        const updatedPatient = await wsSubRepo.updateResource<Patient>({
          ...patient,
          active: true,
        });
        expect(updatedPatient).toBeDefined();
        await findAndExecDispatchJob(updatedPatient, 'update');

        notificationArgs = await nextArgsPromise;
        expect(notificationArgs).toMatchObject<EventNotificationArgs<Patient>>([
          expect.objectContaining(updatedPatient),
          subscription.id,
          { includeResource: true },
        ]);

        // Delete the patient
        nextArgsPromise = waitForNextSubNotification<Patient>();
        await wsSubRepo.deleteResource('Patient', updatedPatient.id);
        await findAndExecDispatchJob(updatedPatient, 'delete');

        notificationArgs = await nextArgsPromise;
        expect(notificationArgs).toMatchObject<EventNotificationArgs<Patient>>([
          expect.objectContaining(updatedPatient),
          subscription.id,
          { includeResource: true },
        ]);
      }));

    test('execSubscriptionJob ignores resource versions that cannot be found', () =>
      withTestContext(async () => {
        const subscription = await repo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Subscription',
          channel: {
            type: 'rest-hook',
            endpoint: 'https://example.com/',
          },
        });
        expect(subscription).toBeDefined();

        const resource = await repo.createResource<Subscription>({
          resourceType: 'Subscription',
          status: 'active',
          reason: "raison d'être",
          criteria: 'Patient?name=somethingrandom',
          channel: { type: 'websocket' },
        });

        await expect(findAndExecSubscriptionJob(resource, 'create')).rejects.toThrow('Not found');

        // No jobs were queued, but we still want to test that execSubscriptionJob handles this gracefully
        // if the job had made its way to the queue previously under different logic

        const ctx = tryGetRequestContext();
        const jobData: SubscriptionJobData = {
          subscriptionId: subscription.id,
          resourceType: resource.resourceType,
          channelType: subscription.channel.type,
          id: resource.id,
          versionId: resource.meta?.versionId as string,
          interaction: 'create',
          requestTime: new Date().toISOString(),
          requestId: ctx?.requestId,
          traceId: ctx?.traceId,
          authState: ctx?.authState,
        };

        // For a websocket subscription, this results in "not found" instead of "gone"
        await repo.deleteResource(resource.resourceType, resource.id);

        // Should not throw
        await execSubscriptionJob({ id: '1', data: jobData } as Job);

        // Fetch should not have been called
        expect(fetch).not.toHaveBeenCalled();

        // No AuditEvent resources should have been created
        const bundle = await repo.search<AuditEvent>({
          resourceType: 'AuditEvent',
          filters: [
            {
              code: 'entity',
              operator: Operator.EQUALS,
              value: getReferenceString(subscription),
            },
          ],
        });
        expect(bundle.entry?.length).toStrictEqual(0);
      }));

    test('Feature Flag Not Enabled', () =>
      withTestContext(async () => {
        globalLogger.level = LogLevel.DEBUG;
        const originalConsoleLog = console.log;
        console.log = jest.fn();

        const { repo: noWsSubRepo, project } = await createTestProject({
          withRepo: true,
          project: { name: 'No WebSocket Subs Project' },
        });

        const subscription = await noWsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient?name=Alice',
          channel: {
            type: 'websocket',
          },
        });
        expect(subscription).toBeDefined();
        expect(subscription.id).toBeDefined();
        await bindSubscription(subscription, project.id);

        const assertPromise = assertNoWsNotifications();

        const patient = await noWsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();
        await findAndExecDispatchJob(patient, 'create');

        await assertPromise;

        expect(console.log).toHaveBeenLastCalledWith(expect.stringMatching(/WebSocket Subscriptions/));

        console.log = originalConsoleLog;
        globalLogger.level = LogLevel.NONE;
      }));

    test('Access Policy Not Satisfied', () =>
      withTestContext(async () => {
        globalLogger.level = LogLevel.WARN;
        const originalConsoleLog = console.log;
        console.log = jest.fn();

        // Create an access policy in different project
        // This should trigger an error when the subscription is executed
        const accessPolicy = await repo.createResource<AccessPolicy>({
          resourceType: 'AccessPolicy',
          resource: [{ resourceType: 'Patient', criteria: `Patient?_id=${generateId()}` }],
        });

        // Create an access policy in different project
        // This should trigger an error when the subscription is executed
        const { repo: wsRepo, project } = await createTestProject({
          withClient: true,
          withRepo: true,
          project: {
            name: 'WebSockets AccessPolicy Denied Project',
            features: ['websocket-subscriptions'],
          },
          membership: {
            accessPolicy: createReference(accessPolicy),
          },
        });

        const subscription = await wsRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'websocket',
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription.id).toBeDefined();

        await bindSubscription(subscription, project.id);

        const assertPromise = assertNoWsNotifications();

        const patient = await wsRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

        await assertPromise;

        expect(console.log).not.toHaveBeenCalledWith(
          expect.stringContaining('[Subscription Access Policy]: Access Policy not satisfied on')
        );
        console.log = originalConsoleLog;
        globalLogger.level = LogLevel.NONE;
      }));

    test('Access policy cache is keyed by channel type -- rest-hook result does not bleed into websocket eval', () =>
      withTestContext(async () => {
        // satisfiesAccessPolicy() is hardcoded to return `true` for non-websocket channel types
        // (rest-hook enforcement is not yet implemented).  If the per-author cache were shared
        // across channel types, the cached `true` from the rest-hook subscription would incorrectly
        // allow the websocket subscription to bypass the access-policy check.
        const url = 'https://example.com/subscription';

        // An access policy that restricts Patient to a specific ID that will never match our patient.
        const accessPolicy = await repo.createResource<AccessPolicy>({
          resourceType: 'AccessPolicy',
          resource: [{ resourceType: 'Patient', criteria: `Patient?_id=${generateId()}` }],
        });

        // Create a project whose membership carries the denying access policy.
        // The project must have 'websocket-subscriptions' enabled so that the websocket
        // subscription is fetched and evaluated.
        const { repo: testRepo, project: testProject } = await createTestProject({
          withClient: true,
          withRepo: true,
          project: {
            name: 'Access Policy Cache Channel Type Isolation Project',
            features: ['websocket-subscriptions'],
          },
          membership: {
            accessPolicy: createReference(accessPolicy),
          },
        });

        // Both subscriptions share the same author (the project client).
        const restHookSub = await testRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: { type: 'rest-hook', endpoint: url },
        });
        expect(restHookSub.id).toBeDefined();

        const wsSub = await testRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: { type: 'websocket' },
        });
        expect(wsSub.id).toBeDefined();
        await bindSubscription(wsSub, testProject.id);

        // Register the no-notification assertion before creating the patient so that
        // any spurious WebSocket publish is caught immediately.
        const assertPromise = assertNoWsNotifications();

        const patient = await testRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });

        // The websocket subscription must NOT have fired -- the access policy denied access
        // and the rest-hook's cached `true` must not have been reused for the websocket check.
        await assertPromise;

        // The rest-hook subscription MUST still be enqueued -- satisfiesAccessPolicy()
        // unconditionally returns `true` for non-websocket channel types.
        await findAndExecSubscriptionJob(patient, 'create', restHookSub);
      }));

    test('Subscription Author Has No Membership', () =>
      withTestContext(async () => {
        globalLogger.level = LogLevel.WARN;
        const originalConsoleLog = console.log;
        console.log = jest.fn();

        const accessPolicy = await superAdminRepo.createResource<AccessPolicy>({
          resourceType: 'AccessPolicy',
          resource: [{ resourceType: 'Patient', readonly: true }, { resourceType: 'Subscription' }],
        });

        const {
          repo: wsRepo,
          project,
          membership,
        } = await createTestProject({
          withClient: true,
          withRepo: true,
          project: {
            name: 'WebSockets AccessPolicy No Membership Project',
            features: ['websocket-subscriptions'],
          },
          membership: {
            accessPolicy: createReference(accessPolicy),
          },
        });

        const subscription = await wsRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'websocket',
          },
        });

        expect(membership.id).toBeDefined();
        expect(membership.accessPolicy).toBeDefined();
        expect(subscription).toBeDefined();
        expect(subscription.id).toBeDefined();

        await bindSubscription(subscription, project.id);

        await superAdminRepo.deleteResource('ProjectMembership', membership.id);

        const assertPromise = assertNoWsNotifications();

        const patient = await wsRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

        await findAndExecDispatchJob(patient, 'create');
        await assertPromise;

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('[Subscription Access Policy]: No membership for subscription author')
        );
        console.log = originalConsoleLog;
        globalLogger.level = LogLevel.NONE;
      }));

    test('Error Occurred During Check', () =>
      withTestContext(async () => {
        globalLogger.level = LogLevel.WARN;
        const originalConsoleLog = console.log;
        console.log = jest.fn();

        const accessPolicy = await superAdminRepo.createResource<AccessPolicy>({
          resourceType: 'AccessPolicy',
          resource: [{ resourceType: 'Patient', readonly: true }, { resourceType: 'Subscription' }],
        });

        const {
          repo: wsRepo,
          membership,
          project,
        } = await createTestProject({
          withClient: true,
          withRepo: true,
          project: {
            name: 'WebSockets AccessPolicy Error Project',
            features: ['websocket-subscriptions'],
          },
          membership: {
            accessPolicy: createReference(accessPolicy),
          },
        });

        const subscription = await wsRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'websocket',
          },
        });

        expect(membership.id).toBeDefined();
        expect(membership.accessPolicy).toBeDefined();
        expect(subscription).toBeDefined();
        expect(subscription.id).toBeDefined();

        await bindSubscription(subscription, project.id);

        await superAdminRepo.deleteResource('AccessPolicy', accessPolicy.id);

        const assertPromise = assertNoWsNotifications();

        const patient = await wsRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

        await findAndExecDispatchJob(patient, 'create');
        await assertPromise;

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining(
            '[Subscription Access Policy]: Error occurred while checking access policy for resource'
          )
        );
        console.log = originalConsoleLog;
        globalLogger.level = LogLevel.NONE;
      }));

    test('Criteria stored in Redis hash alongside subscription reference', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WebSocket Subs Redis Hash Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        const subscription = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient?name=Alice',
          channel: {
            type: 'websocket',
          },
        });
        expect(subscription).toBeDefined();

        // The hash should be empty until a client binds via WebSocket
        const preBindSubs = await getActiveSubscriptions(wsProject.id, 'Patient');
        expect(preBindSubs[`Subscription/${subscription.id}`]).toBeUndefined();

        await bindSubscription(subscription, wsProject.id);

        const activeSubs = await getActiveSubscriptions(wsProject.id, 'Patient');
        expect(activeSubs[`Subscription/${subscription.id}`]).toMatchObject({
          criteria: 'Patient?name=Alice',
          expiration: expect.any(Number),
          author: expect.any(String),
        });
      }));

    test('Invalid criteria resource type is not added to Redis hash', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WebSocket Subs Invalid Criteria Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        const subscription = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'FakeResourceType?name=Alice',
          channel: {
            type: 'websocket',
          },
        });
        expect(subscription).toBeDefined();

        const activeSubs = await getActiveSubscriptions(wsProject.id, 'FakeResourceType' as ResourceType);
        expect(activeSubs[`Subscription/${subscription.id}`]).toBeUndefined();
      }));

    test('Resource type filtering - only matching subscriptions fetched from Redis', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WebSocket Subs Filtering Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        // Create a subscription watching Observation
        const observationSub = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Observation?code=test',
          channel: {
            type: 'websocket',
          },
        });
        expect(observationSub).toBeDefined();
        await bindSubscription(observationSub, wsProject.id);

        // Create a subscription watching Patient
        const patientSub = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient?name=Alice',
          channel: {
            type: 'websocket',
          },
        });
        expect(patientSub).toBeDefined();
        await bindSubscription(patientSub, wsProject.id);

        // Creating a Patient should only trigger the Patient subscription, not the Observation one
        const nextArgsPromise = waitForNextSubNotification<Patient>();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();
        await findAndExecDispatchJob(patient, 'create');

        const notificationArgs = await nextArgsPromise;
        // The notification should be for the patient subscription
        expect(notificationArgs).toMatchObject<EventNotificationArgs<Patient>>([
          expect.objectContaining(patient),
          patientSub.id,
          { includeResource: true },
        ]);
      }));

    test('Resource type filtering - Observation subscription does not fire for Patient create', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo } = await createTestProject({
          project: { name: 'WebSocket Subs No Fire Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        // Create only an Observation subscription
        const observationSub = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Observation',
          channel: {
            type: 'websocket',
          },
        });
        expect(observationSub).toBeDefined();

        // Creating a Patient should NOT trigger the Observation subscription
        const assertPromise = assertNoWsNotifications();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Bob'], family: 'Jones' }],
        });
        expect(patient).toBeDefined();

        await assertPromise;
      }));

    test('Supported Interaction Extension', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          withClient: true,
          withRepo: true,
          project: {
            name: 'WebSocket Subs Project',
            features: ['websocket-subscriptions'],
          },
        });

        const subscription = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: {
            type: 'websocket',
          },
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
              valueCode: 'create',
            },
          ],
        });

        expect(subscription).toBeDefined();
        expect(subscription.id).toBeDefined();
        await bindSubscription(subscription, wsProject.id);

        const nextArgsPromise = waitForNextSubNotification<Patient>();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();
        await findAndExecDispatchJob(patient, 'create');

        const notificationArgs = await nextArgsPromise;
        expect(notificationArgs).toMatchObject<EventNotificationArgs<Patient>>([
          expect.objectContaining(patient),
          subscription.id,
          { includeResource: true },
        ]);

        // Update the patient
        // This shouldn't trigger a notification

        const assertPromise = assertNoWsNotifications();

        const updatedPatient = await wsSubRepo.updateResource<Patient>({
          ...patient,
          active: true,
        });
        expect(updatedPatient).toBeDefined();

        await assertPromise;
      }));

    test('Cached criteria - multiple subscriptions with same matching criteria all receive notification', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WS Cached Criteria Match Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        const criteria = 'Patient?name=Alice';

        const sub1 = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria,
          channel: { type: 'websocket' },
        });
        await bindSubscription(sub1, wsProject.id);

        const sub2 = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria,
          channel: { type: 'websocket' },
        });
        await bindSubscription(sub2, wsProject.id);

        const sub3 = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria,
          channel: { type: 'websocket' },
        });
        await bindSubscription(sub3, wsProject.id);

        const nextMessagePromise = waitForNextSubMessage();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();
        await findAndExecDispatchJob(patient, 'create');

        const message = await nextMessagePromise;
        const subIds = message.events.map(([subId]) => subId);
        expect(subIds).toHaveLength(3);
        expect(subIds).toContain(sub1.id);
        expect(subIds).toContain(sub2.id);
        expect(subIds).toContain(sub3.id);
      }));

    test('Cached criteria - multiple subscriptions with same non-matching criteria do not fire', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo } = await createTestProject({
          project: { name: 'WS Cached Criteria No Match Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        const criteria = 'Patient?name=Alice';

        await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria,
          channel: { type: 'websocket' },
        });

        await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria,
          channel: { type: 'websocket' },
        });

        await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria,
          channel: { type: 'websocket' },
        });

        const assertPromise = assertNoWsNotifications();
        await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Bob'], family: 'Jones' }],
        });
        await assertPromise;
      }));

    test('Cached criteria - subscriptions with different criteria are evaluated independently', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WS Cached Criteria Mixed Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        // Two subscriptions with criteria that will match
        const aliceSub1 = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient?name=Alice',
          channel: { type: 'websocket' },
        });
        await bindSubscription(aliceSub1, wsProject.id);

        const aliceSub2 = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient?name=Alice',
          channel: { type: 'websocket' },
        });
        await bindSubscription(aliceSub2, wsProject.id);

        // Two subscriptions with criteria that will NOT match
        const bobSub1 = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient?name=Bob',
          channel: { type: 'websocket' },
        });
        await bindSubscription(bobSub1, wsProject.id);

        const bobSub2 = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient?name=Bob',
          channel: { type: 'websocket' },
        });
        await bindSubscription(bobSub2, wsProject.id);

        const nextMessagePromise = waitForNextSubMessage();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();
        await findAndExecDispatchJob(patient, 'create');

        // Only the Alice subscriptions should fire; Bob subscriptions should be skipped via cached result
        const message = await nextMessagePromise;
        const subIds = message.events.map(([subId]) => subId);
        expect(subIds).toHaveLength(2);
        expect(subIds).toContain(aliceSub1.id);
        expect(subIds).toContain(aliceSub2.id);
      }));

    test('Logs WS subscription eval info after evaluating criteria', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WS Sub Eval Log Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        const subscription = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: { type: 'websocket' },
        });

        expect(subscription).toBeDefined();
        await bindSubscription(subscription, wsProject.id);

        const mockInfo = jest.fn();
        const getLoggerSpy = jest.spyOn(loggerModule, 'getLogger').mockReturnValue({
          info: mockInfo,
          warn: jest.fn(),
          debug: jest.fn(),
          error: jest.fn(),
        } as any);

        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });

        await addSubscriptionJobs(patient, undefined, { project: wsProject, interaction: 'create' });

        expect(mockInfo).toHaveBeenCalledWith(
          '[WS] Evaluated active subscription criteria',
          expect.objectContaining({
            projectId: wsProject.id,
            resourceType: 'Patient',
            numSubscriptions: expect.any(Number),
            evalDurationMs: expect.any(Number),
          })
        );

        getLoggerSpy.mockRestore();
      }));

    test('Expired entries are removed from active subscriptions hash', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WS Expiry Cleanup Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        const authorRef = `Practitioner/${randomUUID()}`;
        const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
        const pastExpiry = Math.floor(Date.now() / 1000) - 3600;

        // Create the subscription resources (cache-only)
        const validSub = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: { type: 'websocket' },
        });

        const expiredSub = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test expired',
          status: 'active',
          criteria: 'Patient',
          channel: { type: 'websocket' },
        });

        // Simulate binding: populate the pubsub hash with both entries
        const validSubRef = `Subscription/${validSub.id}`;
        const expiredSubRef = `Subscription/${expiredSub.id}`;

        await addUserActiveWebSocketSubscription(authorRef, validSubRef);
        await setActiveSubscription(wsProject.id, 'Patient', validSubRef, {
          criteria: 'Patient',
          expiration: futureExpiry,
          author: authorRef,
          loginId: randomUUID(),
          membershipId: randomUUID(),
        });

        await addUserActiveWebSocketSubscription(authorRef, expiredSubRef);
        await setActiveSubscription(wsProject.id, 'Patient', expiredSubRef, {
          criteria: 'Patient',
          expiration: pastExpiry,
          author: authorRef,
          loginId: randomUUID(),
          membershipId: randomUUID(),
        });

        // Both entries should be in the hash before the worker runs
        const preCleanupSubs = await getActiveSubscriptions(wsProject.id, 'Patient');
        expect(preCleanupSubs[validSubRef]).toBeDefined();
        expect(preCleanupSubs[expiredSubRef]).toBeDefined();

        // The valid subscription fires a notification — use it to confirm the worker ran
        const nextNotificationPromise = waitForNextSubNotification<Patient>();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        await findAndExecDispatchJob(patient, 'create');
        await nextNotificationPromise;

        // The expired entry should have been cleaned from the hash
        const postCleanupSubs = await getActiveSubscriptions(wsProject.id, 'Patient');
        expect(postCleanupSubs[expiredSubRef]).toBeUndefined();
        // The valid entry must still be present
        expect(postCleanupSubs[validSubRef]).toBeDefined();
      }));

    test('Expired entries are removed from the user active set', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WS Expiry User Set Cleanup Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        const authorRef = `Practitioner/${randomUUID()}`;
        const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
        const pastExpiry = Math.floor(Date.now() / 1000) - 3600;

        const validSub = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test',
          status: 'active',
          criteria: 'Patient',
          channel: { type: 'websocket' },
        });

        const expiredSub = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test expired',
          status: 'active',
          criteria: 'Patient',
          channel: { type: 'websocket' },
        });

        const validSubRef = `Subscription/${validSub.id}`;
        const expiredSubRef = `Subscription/${expiredSub.id}`;

        await addUserActiveWebSocketSubscription(authorRef, validSubRef);
        await setActiveSubscription(wsProject.id, 'Patient', validSubRef, {
          criteria: 'Patient',
          expiration: futureExpiry,
          author: authorRef,
          loginId: randomUUID(),
          membershipId: randomUUID(),
        });

        await addUserActiveWebSocketSubscription(authorRef, expiredSubRef);
        await setActiveSubscription(wsProject.id, 'Patient', expiredSubRef, {
          criteria: 'Patient',
          expiration: pastExpiry,
          author: authorRef,
          loginId: randomUUID(),
          membershipId: randomUUID(),
        });

        const countBefore = await getUserActiveWebSocketSubscriptionCount(authorRef);
        expect(countBefore).toBe(2);

        // Trigger the worker; valid sub fires, expired is cleaned up
        const nextNotificationPromise = waitForNextSubNotification<Patient>();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        await findAndExecDispatchJob(patient, 'create');
        await nextNotificationPromise;

        // Expired entry should be removed from the user active set
        const countAfter = await getUserActiveWebSocketSubscriptionCount(authorRef);
        expect(countAfter).toBe(1);
      }));

    test('No notification is sent for an expired subscription entry', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo, project: wsProject } = await createTestProject({
          project: { name: 'WS Expiry No Notify Project', features: ['websocket-subscriptions'] },
          withRepo: true,
        });

        const authorRef = `Practitioner/${randomUUID()}`;
        const pastExpiry = Math.floor(Date.now() / 1000) - 3600;

        // Create only an expired subscription — no valid one to fire
        const expiredSub = await wsSubRepo.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'test expired',
          status: 'active',
          criteria: 'Patient',
          channel: { type: 'websocket' },
        });

        await addUserActiveWebSocketSubscription(authorRef, `Subscription/${expiredSub.id}`);
        await setActiveSubscription(wsProject.id, 'Patient', `Subscription/${expiredSub.id}`, {
          criteria: 'Patient',
          expiration: pastExpiry,
          author: authorRef,
          loginId: randomUUID(),
          membershipId: randomUUID(),
        });

        // No notification should fire despite the criteria matching
        const assertPromise = assertNoWsNotifications();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        await findAndExecDispatchJob(patient, 'create');
        await assertPromise;

        // And the entry should be cleaned up from the hash
        const activeSubs = await getActiveSubscriptions(wsProject.id, 'Patient');
        expect(activeSubs[`Subscription/${expiredSub.id}`]).toBeUndefined();
      }));
  });
});

describe('Subscription Worker Event Handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('Worker event handlers work correctly', async () => {
    // Set up mocks for the bullmq module
    const handlers = new Map<string, ((job?: Job, error?: Error) => void)[] | undefined>();
    const mockWorker = {
      name: 'MockSubscriptionWorker',
      on: jest.fn().mockImplementation((event: string, handler: () => void) => {
        const handlerList = handlers.get(event);
        if (handlerList) {
          handlerList.push(handler);
        } else {
          handlers.set(event, [handler]);
        }
        return mockWorker;
      }),
    };
    mockBullmq.Worker.mockReturnValue(mockWorker as unknown as Worker);
    // Now import the subscription worker init function

    jest.spyOn(globalLogger, 'info').mockImplementation(() => {});

    // Mock the logger and metrics functions
    const recordHistogramValueSpy = jest.spyOn(otelModule, 'recordHistogramValue').mockImplementation();

    // Initialize the subscription worker with mock config
    initSubscriptionWorker({} as MedplumServerConfig);

    // Create test job objects with the structure expected by the handlers
    const createTestJob = (id: string, attemptsMade = 0): Job =>
      ({
        id,
        attemptsMade,
        timestamp: Date.now() - 5000, // 5 seconds ago
        processedOn: Date.now() - 2000, // 2 seconds ago
        finishedOn: Date.now(), // now
        data: {
          subscriptionId: 'subscription-456',
          resourceType: 'Patient',
          id: 'patient-789',
          versionId: '1',
          interaction: 'create',
          requestTime: new Date().toISOString(),
        },
      }) as Job;

    // Test the 'active' event handler with a first attempt job
    const firstAttemptJob = createTestJob('job-123', 0);
    const activeHandlers = handlers.get('active');
    expect(activeHandlers).toBeDefined();
    if (activeHandlers) {
      activeHandlers.forEach((handler) => handler(firstAttemptJob));

      // Verify recordHistogramValue was called for queuedDuration on first attempt
      expect(recordHistogramValueSpy).toHaveBeenCalledWith('medplum.subscription.queuedDuration', expect.any(Number));
      recordHistogramValueSpy.mockClear();
    }

    // Test 'active' handler with a subsequent attempt job
    const subsequentAttemptJob = createTestJob('job-123', 1);
    if (activeHandlers) {
      activeHandlers.forEach((handler) => handler(subsequentAttemptJob));

      // Verify recordHistogramValue was NOT called for subsequent attempts
      expect(recordHistogramValueSpy).not.toHaveBeenCalled();
      recordHistogramValueSpy.mockClear();
    }

    // Test the 'completed' event handler
    const completedJob = createTestJob('job-456');
    const completedHandlers = handlers.get('completed');
    expect(completedHandlers).toBeDefined();
    if (completedHandlers) {
      completedHandlers.forEach((handler) => handler(completedJob));

      // Verify completed job logging and metrics
      expect(recordHistogramValueSpy).toHaveBeenCalledWith(
        'medplum.subscription.executionDuration',
        expect.any(Number)
      );
      expect(recordHistogramValueSpy).toHaveBeenCalledWith('medplum.subscription.totalDuration', expect.any(Number));
      recordHistogramValueSpy.mockClear();
    }

    // Test the 'failed' event handler with a job
    const failedJob = createTestJob('job-789');
    const error = new Error('Test error');
    const failedHandlers = handlers.get('failed');
    expect(failedHandlers).toBeDefined();
    if (failedHandlers) {
      failedHandlers.forEach((handler) => handler(failedJob, error));

      // Verify failed job logging and metrics
      expect(recordHistogramValueSpy).toHaveBeenCalledWith(
        'medplum.subscription.failedExecutionDuration',
        expect.any(Number)
      );
      recordHistogramValueSpy.mockClear();

      // Test 'failed' handler with undefined job
      failedHandlers.forEach((handler) => handler(undefined, error));

      // Verify logging for undefined job (no metrics)
      expect(recordHistogramValueSpy).not.toHaveBeenCalled();
    }
  });
});
