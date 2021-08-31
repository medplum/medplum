import { Patient, stringify, Subscription } from '@medplum/core';
import { Queue } from 'bullmq';
import { createHmac } from 'crypto';
import fetch from 'node-fetch';
import { loadTestConfig } from '../config';
import { closeDatabase, getClient, initDatabase } from '../database';
import { repo } from '../fhir/repo';
import { closeWebhookWorker, initWebhookWorker, sendSubscriptions, WebhookJobData } from './webhooks';

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

  test('Webhook on create', async () => {
    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient).not.toBeUndefined();
    expect(queue.add).toHaveBeenCalled();
  });

  test('Send subscriptions', async () => {
    const url = 'https://example.com/webhook';

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      criteria: 'Patient?active=true',
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

    const jobData = queue.add.mock.calls[0][1] as WebhookJobData;
    await sendSubscriptions(jobData);
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
      criteria: 'Patient?active=true',
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

    const jobData = queue.add.mock.calls[0][1] as WebhookJobData;
    const body = stringify(patient);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    await sendSubscriptions(jobData);
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
      criteria: 'Patient?active=true',
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
    expect(queue.add).toHaveBeenCalled();

    const jobData = queue.add.mock.calls[0][1] as WebhookJobData;
    await sendSubscriptions(jobData);
    expect(fetch).not.toHaveBeenCalledWith();
  });

  test('Ignore webhooks missing URL', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      criteria: 'Patient?active=true',
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
    expect(queue.add).toHaveBeenCalled();

    const jobData = queue.add.mock.calls[0][1] as WebhookJobData;
    await sendSubscriptions(jobData);
    expect(fetch).not.toHaveBeenCalledWith();
  });

  test('Ignore webhooks with missing criteria', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
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
    expect(queue.add).toHaveBeenCalled();

    const jobData = queue.add.mock.calls[0][1] as WebhookJobData;
    await sendSubscriptions(jobData);
    expect(fetch).not.toHaveBeenCalledWith();
  });

  test('Ignore webhooks with different criteria resource type', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
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
    expect(queue.add).toHaveBeenCalled();

    const jobData = queue.add.mock.calls[0][1] as WebhookJobData;
    await sendSubscriptions(jobData);
    expect(fetch).not.toHaveBeenCalledWith();
  });

});
