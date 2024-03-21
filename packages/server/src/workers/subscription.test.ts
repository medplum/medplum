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
import {
  AccessPolicy,
  AuditEvent,
  Bot,
  Observation,
  Patient,
  ProjectMembership,
  Subscription,
} from '@medplum/fhirtypes';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import { Job } from 'bullmq';
import { createHmac, randomUUID } from 'crypto';
import fetch from 'node-fetch';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getDatabasePool } from '../database';
import { Repository, getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';
import { createTestProject, withTestContext } from '../test.setup';
import { AuditEventOutcome } from '../util/auditevent';
import { closeSubscriptionWorker, execSubscriptionJob, getSubscriptionQueue } from './subscription';

jest.mock('node-fetch');

describe('Subscription Worker', () => {
  const systemRepo = getSystemRepo();
  let repo: Repository;
  let botRepo: Repository;
  let mockLambdaClient: AwsClientStub<LambdaClient>;
  let superAdminRepo: Repository;

  beforeEach(() => {
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

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

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
      projects: [botProjectDetails.project.id as string],
      author: createReference(botProjectDetails.client),
    });
  });

  afterAll(async () => {
    await shutdownApp();
    await closeSubscriptionWorker(); // Double close to ensure quite ignore
  });

  beforeEach(async () => {
    await getDatabasePool().query('DELETE FROM "Subscription"');
    (fetch as unknown as jest.Mock).mockClear();
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
      await repo.deleteResource('Patient', patient.id as string);

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
      await repo.deleteResource('Patient', patient.id as string);

      expect(queue.add).not.toHaveBeenCalled();
    }));

  test('Delete-only subscription', () =>
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
          },
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
              valueCode: 'delete',
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
        await repo.deleteResource('Patient', patient.id as string);

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
              'X-Medplum-Deleted-Resource': `Patient/${patient.id}`,
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
          type: 'email',
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
            value: getReferenceString(subscription as Subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(1);

      const auditEvent = bundle.entry?.[0]?.resource as AuditEvent;
      expect(auditEvent.outcomeDesc).toEqual('Bots not enabled');
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
            value: getReferenceString(subscription as Subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(1);
      expect(bundle.entry?.[0]?.resource?.outcome).toEqual('0');
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
        ...(subscription as Subscription),
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
            value: getReferenceString(subscription as Subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(0);
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
      await repo.deleteResource('Subscription', subscription.id as string);

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
            value: getReferenceString(subscription as Subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(0);
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
      await repo.deleteResource('Patient', patient.id as string);

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
            value: getReferenceString(subscription as Subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(0);
    }));

  test('AuditEvent has Subscription account details', () =>
    withTestContext(async () => {
      const project = (await createTestProject()).project.id as string;
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
            value: getReferenceString(subscription as Subscription),
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(1);

      const auditEvent = bundle.entry?.[0]?.resource as AuditEvent;
      expect(auditEvent.meta?.account).toBeDefined();
      expect(auditEvent.meta?.account?.reference).toEqual(account.reference);
      expect(auditEvent.entity).toHaveLength(2);
    }));

  test('AuditEvent outcome from custom codes', () =>
    withTestContext(async () => {
      const project = (await createTestProject()).project.id as string;
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
            value: getReferenceString(subscription as Subscription),
          },
        ],
      });

      expect(bundle.entry?.length).toEqual(1);

      const auditEvent = bundle.entry?.[0].resource as AuditEvent;
      // Should return a successful AuditEventOutcome with a normally failing status
      expect(auditEvent.outcome).toEqual(AuditEventOutcome.Success);
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

      await systemRepo.deleteResource('AccessPolicy', accessPolicy.id as string);

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

      await systemRepo.deleteResource('AccessPolicy', accessPolicy.id as string);

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

  test('WebSocket Subscription -- Enabled', () =>
    withTestContext(async () => {
      const { repo: wsSubRepo } = await createTestProject({
        project: { name: 'WebSocket Subs Project', features: ['websocket-subscriptions'] },
        withRepo: true,
      });

      const subscription = await wsSubRepo.createResource<Subscription>({
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

      // Subscribe to the topic
      const subscriber = getRedis().duplicate();
      await subscriber.subscribe(subscription.id as string);

      let resolve: () => void;
      const deferredPromise = new Promise<void>((_resolve) => {
        resolve = _resolve;
      });

      subscriber.on('message', (topic, message) => {
        expect(topic).toEqual(subscription.id);
        expect(JSON.parse(message)).toEqual(expect.any(Object));
        resolve();
      });

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await wsSubRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).toHaveBeenCalled();

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await execSubscriptionJob(job);

      // Expect that a job is published

      // Clear the queue
      queue.add.mockClear();

      // Update the patient
      await wsSubRepo.updateResource({ ...patient, active: true });

      // Update should also trigger the subscription
      expect(queue.add).toHaveBeenCalled();

      // Clear the queue
      queue.add.mockClear();

      // Delete the patient
      await wsSubRepo.deleteResource('Patient', patient.id as string);

      expect(queue.add).toHaveBeenCalled();

      await deferredPromise;
      await subscriber.quit();
    }));

  test('WebSocket Subscription -- Feature Flag Not Enabled', () =>
    withTestContext(async () => {
      globalLogger.level = LogLevel.WARN;
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
        criteria: 'Patient',
        channel: {
          type: 'websocket',
        },
      });
      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();

      // Subscribe to the topic
      const subscriber = getRedis().duplicate();
      await subscriber.subscribe(subscription.id as string);

      let resolve: () => void;
      let reject: (error: Error) => void;

      const deferredPromise = new Promise<void>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      subscriber.on('message', () => {
        reject(new Error('Should not have been called'));
      });

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await noWsSubRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();

      // Give some time for the callback to get called (it shouldn't)
      setTimeout(() => {
        resolve();
      }, 150);

      await deferredPromise;
      await subscriber.quit();
      expect(console.log).toHaveBeenLastCalledWith(expect.stringMatching(/WebSocket Subscriptions/));

      console.log = originalConsoleLog;
      globalLogger.level = LogLevel.NONE;
    }));

  test('WebSocket Subscription -- Access Policy Not Satisfied', () =>
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

      // Subscribe to the topic
      const subscriber = getRedis().duplicate();
      await subscriber.subscribe(subscription.id as string);

      let resolve: () => void;
      let reject: (error: Error) => void;

      const deferredPromise = new Promise<void>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      subscriber.on('message', () => {
        reject(new Error('Received message when not expected'));
      });

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await wsRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();

      setTimeout(() => resolve(), 300);
      await deferredPromise;
      await subscriber.quit();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[Subscription Access Policy]: Access Policy not satisfied on')
      );
      console.log = originalConsoleLog;
      globalLogger.level = LogLevel.NONE;
    }));

  test('WebSocket Subscription -- Subscription Author Has No Membership', () =>
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

      await superAdminRepo.deleteResource('ProjectMembership', membership.id as string);

      // Subscribe to the topic
      const subscriber = getRedis().duplicate();
      await subscriber.subscribe(subscription.id as string);

      let resolve: () => void;
      let reject: (error: Error) => void;

      const deferredPromise = new Promise<void>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      subscriber.on('message', () => {
        reject(new Error('Received message when not expected'));
      });

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await wsRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();

      setTimeout(() => resolve(), 300);
      await deferredPromise;
      await subscriber.quit();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[Subscription Access Policy]: No membership for subscription author')
      );
      console.log = originalConsoleLog;
      globalLogger.level = LogLevel.NONE;
    }));

  test('WebSocket Subscription -- Error Occurred During Check', () =>
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

      await superAdminRepo.deleteResource('AccessPolicy', accessPolicy.id as string);

      // Subscribe to the topic
      const subscriber = getRedis().duplicate();
      await subscriber.subscribe(subscription.id as string);

      let resolve: () => void;
      let reject: (error: Error) => void;

      const deferredPromise = new Promise<void>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      subscriber.on('message', () => {
        reject(new Error('Received message when not expected'));
      });

      const queue = getSubscriptionQueue() as any;
      queue.add.mockClear();

      const patient = await wsRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient).toBeDefined();
      expect(queue.add).not.toHaveBeenCalled();

      setTimeout(() => resolve(), 300);
      await deferredPromise;
      await subscriber.quit();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          '[Subscription Access Policy]: Error occurred while checking access policy for resource'
        )
      );
      console.log = originalConsoleLog;
      globalLogger.level = LogLevel.NONE;
    }));
});
