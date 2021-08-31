import { Patient, stringify, Subscription } from '@medplum/core';
import { Queue } from 'bullmq';
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
    await initWebhookWorker();
  });

  afterAll(async () => {
    await closeDatabase();
    await closeWebhookWorker();
  });

  beforeEach(async () => {
    await getClient().query('DELETE FROM "Subscription"');
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

    console.log(JSON.stringify(subscriptionOutcome, undefined, 2));

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
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ body: stringify(patient) }));
  });

});
