// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
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
  ProjectMembership,
  Resource,
  Subscription,
  SubscriptionChannel,
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
import { Repository, getSystemRepo } from '../fhir/repo';
import * as loggerModule from '../logger';
import { globalLogger } from '../logger';
import * as otelModule from '../otel/otel';
import { getRedisSubscriber } from '../redis';
import type { SubEventsOptions } from '../subscriptions/websockets';
import { createTestProject, withTestContext } from '../test.setup';
import { AuditEventOutcome } from '../util/auditevent';
import type { SubscriptionJobData } from './subscription';
import { execSubscriptionJob, getSubscriptionQueue, initSubscriptionWorker } from './subscription';

jest.mock('node-fetch');
const mockBullmq = jest.mocked(bullmqModule);

describe('Subscription Worker', () => {
  const systemRepo = getSystemRepo();
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: stringify(patient),
        })
      );

      // Clear the queue
      queue.add.mockClear();

      // Update the patient
      await repo.updateResource({ ...patient, active: true });

      // Update should also trigger the subscription
      expect(queue.add).toHaveBeenCalled();

      // Clear the queue
      queue.add.mockClear();

      // Delete the patient
      await repo.deleteResource('Patient', patient.id);

      expect(queue.add).toHaveBeenCalled();
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 201 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);

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

        const queue = getSubscriptionQueue() as any;
        queue.add.mockClear();

        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();
        expect(queue.add).toHaveBeenCalled();

        (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

        const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
        await execSubscriptionJob(job);

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

      // Clear the queue
      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      // Create the patient
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();

      // Create should trigger the subscription
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: stringify(patient),
        })
      );

      // Clear the queue
      queue.add.mockClear();

      // Update the patient
      await repo.updateResource({ ...patient, active: true });

      // Update should not trigger the subscription
      expect(queue.add).not.toHaveBeenCalled();

      // Delete the patient
      await repo.deleteResource('Patient', patient.id);

      expect(queue.add).not.toHaveBeenCalled();
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
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-secret',
              valueString: secret,
            },
          ],
        });
        expect(subscription).toBeDefined();

        // Clear the queue
        const queue = getSubscriptionQueue() as any;
        queue.add.mockClear();

        // Create the patient
        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

        // Create should trigger the subscription
        expect(queue.add).not.toHaveBeenCalled();

        // Update the patient
        await repo.updateResource({ ...patient, active: true });

        // Update should not trigger the subscription
        expect(queue.add).not.toHaveBeenCalled();

        // Delete the patient
        await repo.deleteResource('Patient', patient.id);

        expect(queue.add).toHaveBeenCalled();
        const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
        await execSubscriptionJob(job);
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
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-secret',
              valueString: secret,
            },
          ],
        });
        expect(subscription).toBeDefined();

        const queue = getSubscriptionQueue() as any;
        queue.add.mockClear();

        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();
        expect(queue.add).toHaveBeenCalled();

        (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

        const body = stringify(patient);
        const signature = createHmac('sha256', secret).update(body).digest('hex');

        const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
        await execSubscriptionJob(job);

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

        const queue = getSubscriptionQueue() as any;
        queue.add.mockClear();

        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();
        expect(queue.add).toHaveBeenCalled();

        (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

        const body = stringify(patient);
        const signature = createHmac('sha256', secret).update(body).digest('hex');

        const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
        await execSubscriptionJob(job);

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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();
    }));

  test.skip('Ignore subscriptions with missing criteria', () =>
    withTestContext(async () => {
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      } as Subscription);
      expect(subscription).toBeDefined();

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'preliminary',
        code: { text: 'ok' },
      });

      expect(queue.add).not.toHaveBeenCalled();

      await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'ok' },
      });

      expect(queue.add).toHaveBeenCalled();
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      // Create a patient in project 2
      const patient = await botRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project,
        },
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();
    }));

  test('Retries in preamble errors', () =>
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      // causes an error to be thrown
      const getLoggerSpy = jest.spyOn(loggerModule, 'getLogger').mockImplementation(() => {
        throw new Error('Logger not available for some weird reason');
      });

      const job = {
        id: 1,
        data: queue.add.mock.calls[0][1],
        attemptsMade: 0,
        changePriority: jest.fn(),
      } as unknown as Job;

      // On the first attempt, throws
      await expect(execSubscriptionJob(job)).rejects.toThrow('Logger not available for some weird reason');
      expect(job.changePriority).not.toHaveBeenCalledWith();

      // On a later attempt, should not throw
      job.attemptsMade = 100000;
      await execSubscriptionJob(job);
      expect(job.changePriority).not.toHaveBeenCalledWith();

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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 429 }));

      const job = {
        id: 1,
        data: queue.add.mock.calls[0][1],
        attemptsMade: 2,
        changePriority: jest.fn(),
      } as unknown as Job;

      // If the job throws, then the QueueScheduler will retry
      await expect(execSubscriptionJob(job)).rejects.toThrow('Received status 429');
      expect(job.changePriority).toHaveBeenCalledWith({ priority: 3 });
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => {
        throw new Error('foo');
      });

      const job = {
        id: 1,
        data: queue.add.mock.calls[0][1],
        attemptsMade: 2,
        changePriority: jest.fn(),
      } as unknown as Job;

      // If the job throws, then the QueueScheduler will retry
      await expect(execSubscriptionJob(job)).rejects.toThrow('foo');
      expect(job.changePriority).toHaveBeenCalledWith({ priority: 3 });
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => {
        throw new Error();
      });

      const job = { id: 1, data: queue.add.mock.calls[0][1], attemptsMade: 1 } as unknown as Job;
      // Job shouldn't throw after max attempts, which will cause it to not retry
      const result = await execSubscriptionJob(job);
      expect(result).toBeUndefined();
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);
      expect(fetch).not.toHaveBeenCalled();

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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await botRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await botRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      // At this point the job should be in the queue
      // But let's change the subscription status to something else
      await repo.updateResource<Subscription>({
        ...subscription,
        status: 'off',
      });

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);

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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(queue.add).toHaveBeenCalled();

      // At this point the job should be in the queue
      // But let's delete the subscription
      await repo.deleteResource('Subscription', subscription.id);

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);

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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(queue.add).toHaveBeenCalled();

      // At this point the job should be in the queue
      // But let's delete the resource
      await repo.deleteResource('Patient', patient.id);

      const job = { id: 1, data: queue.add.mock.calls[0][1], attemptsMade: 2 } as unknown as Job;
      await execSubscriptionJob(job);

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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project,
          account,
        },
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);

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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project,
          account,
        },
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 515 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);

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

      // Clear the queue
      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      // Clear the queue
      queue.add.mockClear();

      // Update the patient
      const patient2 = await repo.updateResource({ ...patient, name: [{ given: ['Bob'], family: 'Smith' }] });

      expect(queue.add).toHaveBeenCalled();
      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);
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

      // Clear the queue
      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      // Clear the queue
      queue.add.mockClear();

      // Update the patient
      await repo.updateResource({ ...patient, name: [{ given: ['Bob'], family: 'Smith' }] });

      expect(queue.add).not.toHaveBeenCalled();
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

      const queue = getSubscriptionQueue() as any;

      // Clear mock because we only care about updates for this test, when %previous is not empty from the start
      queue.add.mockClear();

      patient = await repo.updateResource<Patient>({
        ...patient,
        address: [{ postalCode: '94134' }, { postalCode: '94136' }],
      });
      expect(patient).toBeDefined();

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add.mock.calls[0][1]?.id).toStrictEqual(patient.id);
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

      // Clear the queue
      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      await systemRepo.deleteResource('AccessPolicy', accessPolicy.id);

      // Update the patient
      const patient2 = await apTestRepo.updateResource({ ...patient, name: [{ given: ['Bob'], family: 'Smith' }] });

      expect(queue.add).toHaveBeenCalled();
      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);
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
      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      await systemRepo.deleteResource('AccessPolicy', accessPolicy.id);

      // Update the patient
      const patient2 = await apTestRepo.updateResource({ ...patient, name: [{ given: ['Bob'], family: 'Smith' }] });

      expect(queue.add).toHaveBeenCalled();
      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);
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

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

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
      expect(queue.add).toHaveBeenCalled();

      (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('?Expires='),
        })
      );

      // Clear the queue
      queue.add.mockClear();
    }));

  describe('WebSocket Subscriptions', () => {
    type EventNotificationArgs<T extends Resource> = [T, string, SubEventsOptions];

    let subscriber: Redis;
    let resolveExpected: ((args: EventNotificationArgs<Resource>) => void) | undefined;
    let rejectNotExpected: ((err: Error) => void) | undefined;

    beforeAll(async () => {
      subscriber = getRedisSubscriber();
      subscriber.on('message', (_channel, argsArr) => {
        const parsedArgsArr = JSON.parse(argsArr) as [Resource, string, SubEventsOptions][];
        if (resolveExpected) {
          resolveExpected(parsedArgsArr[0]);
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

    test('Enabled', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo } = await createTestProject({
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

        let nextArgsPromise = waitForNextSubNotification<Patient>();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });

        expect(patient).toBeDefined();

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

        notificationArgs = await nextArgsPromise;
        expect(notificationArgs).toMatchObject<EventNotificationArgs<Patient>>([
          expect.objectContaining(updatedPatient),
          subscription.id,
          { includeResource: true },
        ]);

        // Delete the patient
        nextArgsPromise = waitForNextSubNotification<Patient>();
        await wsSubRepo.deleteResource('Patient', updatedPatient.id);

        notificationArgs = await nextArgsPromise;
        expect(notificationArgs).toMatchObject<EventNotificationArgs<Patient>>([
          expect.objectContaining(updatedPatient),
          subscription.id,
          { includeResource: true },
        ]);
      }));

    test.each([
      [{ type: 'websocket' }, false], // websocket subscriptions should not trigger subscriptions since they have a different persistence story
      [{ type: 'rest-hook' }, true], // even though endpoint is missing, this is still valid as a trigger of (valid) subscriptions
      [{ type: 'rest-hook', endpoint: 'https://example.com/subscription' }, true],
      [{ type: 'message' }, true],
    ] as [SubscriptionChannel, boolean][])(
      'Ignore subscriptions on subscriptions with channel %j',
      (subChannel, expectedToFire) =>
        withTestContext(async () => {
          const { repo: wsSubRepo } = await createTestProject({
            project: { name: 'WebSocket Subs Project', features: ['websocket-subscriptions'] },
            withRepo: true,
          });

          const subscription = await wsSubRepo.createResource<Subscription>({
            resourceType: 'Subscription',
            reason: 'test',
            status: 'active',
            criteria: 'Subscription',
            channel: {
              type: 'rest-hook',
              endpoint: 'https://example.com/subscription',
            },
          });
          expect(subscription).toBeDefined();
          expect(subscription.id).toBeDefined();

          const queue = getSubscriptionQueue() as any;
          queue.add.mockClear();

          const sub = await wsSubRepo.createResource<Subscription>({
            resourceType: 'Subscription',
            status: 'active',
            reason: "raison d'être",
            criteria: 'Patient?name=somethingrandom',
            channel: subChannel,
          });

          expect(sub).toBeDefined();
          if (expectedToFire) {
            expect(queue.add).toHaveBeenCalledTimes(1);
          } else {
            expect(queue.add).not.toHaveBeenCalled();
          }
        })
    );

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

        const queue = getSubscriptionQueue() as any;
        queue.add.mockClear();

        const resource = await repo.createResource<Subscription>({
          resourceType: 'Subscription',
          status: 'active',
          reason: "raison d'être",
          criteria: 'Patient?name=somethingrandom',
          channel: { type: 'websocket' },
        });

        expect(queue.add).not.toHaveBeenCalled();

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

        const { repo: noWsSubRepo } = await createTestProject({
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

        const assertPromise = assertNoWsNotifications();

        const patient = await noWsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

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
        const { repo: wsRepo } = await createTestProject({
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

    test('Subscription Author Has No Membership', () =>
      withTestContext(async () => {
        globalLogger.level = LogLevel.WARN;
        const originalConsoleLog = console.log;
        console.log = jest.fn();

        const accessPolicy = await superAdminRepo.createResource<AccessPolicy>({
          resourceType: 'AccessPolicy',
          resource: [{ resourceType: 'Patient', readonly: true }, { resourceType: 'Subscription' }],
        });

        const { repo: wsRepo, membership } = await createTestProject({
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

        await superAdminRepo.deleteResource('ProjectMembership', membership.id);

        const assertPromise = assertNoWsNotifications();

        const patient = await wsRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

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

        const { repo: wsRepo, membership } = await createTestProject({
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

        await superAdminRepo.deleteResource('AccessPolicy', accessPolicy.id);

        const assertPromise = assertNoWsNotifications();

        const patient = await wsRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

        await assertPromise;

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining(
            '[Subscription Access Policy]: Error occurred while checking access policy for resource'
          )
        );
        console.log = originalConsoleLog;
        globalLogger.level = LogLevel.NONE;
      }));

    test('Supported Interaction Extension', () =>
      withTestContext(async () => {
        const { repo: wsSubRepo } = await createTestProject({
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

        const nextArgsPromise = waitForNextSubNotification<Patient>();
        const patient = await wsSubRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
        expect(patient).toBeDefined();

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
