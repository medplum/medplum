import { createReference, getReferenceString, Operator, stringify } from '@medplum/core';
import { AuditEvent, Bot, Observation, Patient, Project, ProjectMembership, Subscription } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { createHmac, randomUUID } from 'crypto';
import fetch from 'node-fetch';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getClient } from '../database';
import { Repository, systemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';
import { closeSubscriptionWorker, execSubscriptionJob, getSubscriptionQueue } from './subscription';
import { AuditEventOutcome } from '../util/auditevent';

jest.mock('node-fetch');

let repo: Repository;
let botRepo: Repository;

describe('Subscription Worker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    // Create one simple project with no advanced features enabled
    const testProject = await systemRepo.createResource<Project>({
      resourceType: 'Project',
      name: 'Test Project',
      owner: {
        reference: 'User/' + randomUUID(),
      },
    });

    repo = new Repository({
      extendedMode: true,
      project: testProject.id,
      author: {
        reference: 'ClientApplication/' + randomUUID(),
      },
    });

    // Create another project, this one with bots enabled
    const botProjectDetails = await createTestProject();
    botRepo = new Repository({
      extendedMode: true,
      project: botProjectDetails.project.id,
      author: createReference(botProjectDetails.client),
    });
  });

  afterAll(async () => {
    await shutdownApp();
    await closeSubscriptionWorker(); // Double close to ensure quite ignore
  });

  beforeEach(async () => {
    await getClient().query('DELETE FROM "Subscription"');
    (fetch as unknown as jest.Mock).mockClear();
  });

  test('Send subscriptions', async () => {
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
  });

  test('Status code 201', async () => {
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
  });

  test('Send subscription with custom headers', async () => {
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
          'Content-Type': 'application/fhir+json',
          Authorization: 'Basic xyz',
        },
      })
    );
  });

  test('Create-only subscription', async () => {
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
  });

  test('Delete-only subscription', async () => {
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
          'Content-Type': 'application/fhir+json',
          'X-Medplum-Deleted-Resource': `Patient/${patient.id}`,
        },
      })
    );
  });

  test('Send subscriptions with signature', async () => {
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
          'Content-Type': 'application/fhir+json',
          'X-Signature': signature,
        },
      })
    );
  });

  test('Send subscriptions with legacy signature extension', async () => {
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
          'Content-Type': 'application/fhir+json',
          'X-Signature': signature,
        },
      })
    );
  });

  test('Ignore non-subscription subscriptions', async () => {
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
  });

  test('Ignore subscriptions missing URL', async () => {
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
  });

  test.skip('Ignore subscriptions with missing criteria', async () => {
    const subscription = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      reason: 'test',
      status: 'active',
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
  });

  test('Ignore subscriptions with different criteria resource type', async () => {
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
  });

  test('Ignore subscriptions with different criteria parameter', async () => {
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
  });

  test('Ignore disabled subscriptions', async () => {
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
  });

  test('Ignore resource changes in different project', async () => {
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
  });

  test('Ignore resource changes in different account compartment', async () => {
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
  });

  test('Retry on 429', async () => {
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

    const job = { id: 1, data: queue.add.mock.calls[0][1], attemptsMade: 2 } as unknown as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execSubscriptionJob(job)).rejects.toThrow();
  });

  test('Retry on exception', async () => {
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
      throw new Error();
    });

    const job = { id: 1, data: queue.add.mock.calls[0][1], attemptsMade: 2 } as unknown as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execSubscriptionJob(job)).rejects.toThrow();
  });

  test('Do not throw after max job attempts', async () => {
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
    expect(execSubscriptionJob(job)).resolves;
  });

  test('Ignore bots if feature not enabled', async () => {
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
  });

  test('Execute bot subscriptions', async () => {
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
  });

  test('Stop retries if Subscription status not active', async () => {
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
  });

  test('Stop retries if Subscription deleted', async () => {
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
    await repo.deleteResource('Subscription', subscription?.id as string);

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
  });

  test('Stop retries if Resource deleted', async () => {
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
  });

  test('AuditEvent has Subscription account details', async () => {
    const project = randomUUID();
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

    const auditEvent = bundle?.entry?.[0].resource as AuditEvent;
    expect(auditEvent.meta?.account).toBeDefined();
    expect(auditEvent.meta?.account?.reference).toEqual(account.reference);
    expect(auditEvent.entity).toHaveLength(2);
  });

  test('Audit Event outcome from custom codes', async () => {
    const project = randomUUID();
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

    const auditEvent = bundle?.entry?.[0].resource as AuditEvent;
    // Should return a successful AuditEventOutcome with a normally failing status
    expect(auditEvent.outcome).toEqual(AuditEventOutcome.Success);
  });

  test('FhirPathCriteria extension', async () => {
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
  });

  test('FhirPathCriteria extension not met', async () => {
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
  });
});
