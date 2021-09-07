import { Observation, Patient, stringify, Subscription } from '@medplum/core';
import { Job, Queue } from 'bullmq';
import { createHmac, randomUUID } from 'crypto';
import fetch from 'node-fetch';
import { loadTestConfig } from '../config';
import { closeDatabase, getClient, initDatabase } from '../database';
import { repo } from '../fhir/repo';
import { closeWebhookWorker, initWebhookWorker, sendWebhook } from './webhooks';

jest.mock('bullmq');
jest.mock('node-fetch');

describe('Webhook Worker', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initWebhookWorker(config.redis);
  });

  afterAll(async () => {
    await closeDatabase();
    await closeWebhookWorker();
    await closeWebhookWorker(); // Double close to ensure quite ignore
  });

  beforeEach(async () => {
    await getClient().query('DELETE FROM "Subscription"');
    (fetch as any).mockClear();
  });

  test('Send subscriptions', async () => {
    const url = 'https://example.com/webhook';

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: url
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendWebhook(job);

    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({
      method: 'POST',
      body: stringify(patient)
    }));
  });

  test('Send subscriptions with signature', async () => {
    const url = 'https://example.com/webhook';
    const secret = '0123456789';

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: url
      },
      extension: [{
        url: 'https://www.medplum.com/fhir/StructureDefinition-subscriptionSecret',
        valueString: secret
      }]
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 200 }));

    const body = stringify(patient);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendWebhook(job);

    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/fhir+json',
        'X-Signature': signature
      }
    }));
  });

  test('Ignore non-webhook subscriptions', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'email'
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore webhooks missing URL', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: ''
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore webhooks with missing criteria', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/webhook'
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore webhooks with different criteria resource type', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Observation',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/webhook'
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore webhooks with different criteria parameter', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Observation?status=final',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/webhook'
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'preliminary',
      code: { text: 'ok' }
    });

    expect(queue.add).not.toHaveBeenCalled();

    await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'ok' }
    });

    expect(queue.add).toHaveBeenCalled();
  });

  test('Ignore disabled webhooks', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'off',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/webhook'
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore resource changes in different project', async () => {
    const project1 = randomUUID();
    const project2 = randomUUID();

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      meta: {
        project: project1
      },
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/webhook'
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      meta: {
        project: project2
      },
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Retry on 400', async () => {
    const url = 'https://example.com/webhook';

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: url
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 400 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(sendWebhook(job)).rejects.toThrow();
  });

  test('Retry on exception', async () => {
    const url = 'https://example.com/webhook';

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: url
      }
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).not.toBeUndefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).toHaveBeenCalled();

    // (fetch as any).mockImplementation(() => ({ status: 400 }));
    (fetch as any).mockImplementation(() => {
      throw new Error();
    });

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(sendWebhook(job)).rejects.toThrow();
  });

});
