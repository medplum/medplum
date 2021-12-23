import { assertOk, getReferenceString, Operator, stringify } from '@medplum/core';
import { AuditEvent, Bot, Observation, Patient, Subscription } from '@medplum/fhirtypes';
import { Job, Queue } from 'bullmq';
import { createHmac, randomUUID } from 'crypto';
import fetch from 'node-fetch';
import { loadTestConfig } from '../config';
import { closeDatabase, getClient, initDatabase } from '../database';
import { Repository, systemRepo } from '../fhir/repo';
import { seedDatabase } from '../seed';
import { closeSubscriptionWorker, initSubscriptionWorker, sendSubscription } from './subscription';

jest.mock('bullmq');
jest.mock('node-fetch');

let repo: Repository;

describe('Subscription Worker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initSubscriptionWorker(config.redis);

    repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'ClientApplication/' + randomUUID(),
      },
    });
  });

  afterAll(async () => {
    await closeDatabase();
    await closeSubscriptionWorker();
    await closeSubscriptionWorker(); // Double close to ensure quite ignore
  });

  beforeEach(async () => {
    await getClient().query('DELETE FROM "Subscription"');
    (fetch as any).mockClear();
  });

  test('Send subscriptions', async () => {
    const url = 'https://example.com/subscription';

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: url,
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendSubscription(job);

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

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: url,
        header: ['Authorization: Basic xyz'],
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendSubscription(job);

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

  test('Send subscriptions with signature', async () => {
    const url = 'https://example.com/subscription';
    const secret = '0123456789';

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
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
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 200 }));

    const body = stringify(patient);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendSubscription(job);

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
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'email',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore subscriptions missing URL', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: '',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore subscriptions with missing criteria', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore subscriptions with different criteria resource type', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Observation',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore subscriptions with different criteria parameter', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Observation?status=final',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
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
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'off',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore resource changes in different project', async () => {
    const project1 = randomUUID();
    const project2 = randomUUID();

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      meta: {
        project: project1,
      },
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      meta: {
        project: project2,
      },
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Ignore resource changes in different account compartment', async () => {
    const project = randomUUID();
    const account = 'Organization/' + randomUUID();

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
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
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      meta: {
        project,
      },
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Retry on 400', async () => {
    const url = 'https://example.com/subscription';

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: url,
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 400 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(sendSubscription(job)).rejects.toThrow();
  });

  test('Retry on exception', async () => {
    const url = 'https://example.com/subscription';

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: url,
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    // (fetch as any).mockImplementation(() => ({ status: 400 }));
    (fetch as any).mockImplementation(() => {
      throw new Error();
    });

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(sendSubscription(job)).rejects.toThrow();
  });

  test('Execute bot subscriptions', async () => {
    const nonce = randomUUID();

    const [botOutcome, bot] = await repo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
      description: 'Test Bot',
      code: `console.log('${nonce}');`,
    });
    expect(botOutcome.id).toEqual('created');
    expect(bot).toBeDefined();

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: getReferenceString(bot as Bot),
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendSubscription(job);
    expect(fetch).not.toHaveBeenCalled();

    const [searchOutcome, bundle] = await repo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(searchOutcome);
    expect(bundle).toBeDefined();
    expect(bundle?.entry?.length).toEqual(1);
    expect(bundle?.entry?.[0]?.resource?.outcome).toEqual('0');
    expect(bundle?.entry?.[0]?.resource?.outcomeDesc).toContain('Success');
    expect(bundle?.entry?.[0]?.resource?.outcomeDesc).toContain(nonce);
  });

  test('Bot failure', async () => {
    const nonce = randomUUID();

    const [botOutcome, bot] = await repo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
      description: 'Test Bot',
      code: `throw new Error('${nonce}');`,
    });
    expect(botOutcome.id).toEqual('created');
    expect(bot).toBeDefined();

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: getReferenceString(bot as Bot),
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendSubscription(job);
    expect(fetch).not.toHaveBeenCalled();

    const [searchOutcome, bundle] = await repo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(searchOutcome);
    expect(bundle).toBeDefined();
    expect(bundle?.entry?.length).toEqual(1);
    expect(bundle?.entry?.[0]?.resource?.outcome).not.toEqual('0');
    expect(bundle?.entry?.[0]?.resource?.outcomeDesc).toContain('Error');
    expect(bundle?.entry?.[0]?.resource?.outcomeDesc).toContain(nonce);
  });

  test('Stop retries if Subscription status not active', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    // At this point the job should be in the queue
    // But let's change the subscription status to something else
    const [updateOutcome] = await repo.updateResource<Subscription>({
      ...(subscription as Subscription),
      status: 'off',
    });
    expect(updateOutcome.id).toEqual('ok');

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendSubscription(job);

    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();

    // No AuditEvent resources should have been created
    const [searchOutcome, bundle] = await repo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(searchOutcome);
    expect(bundle).toBeDefined();
    expect(bundle?.entry?.length).toEqual(0);
  });

  test('Stop retries if Subscription deleted', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    // At this point the job should be in the queue
    // But let's delete the subscription
    const [deleteOutcome] = await repo.deleteResource('Subscription', subscription?.id as string);
    assertOk(deleteOutcome);

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendSubscription(job);

    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();

    // No AuditEvent resources should have been created
    const [searchOutcome, bundle] = await repo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(searchOutcome);
    expect(bundle).toBeDefined();
    expect(bundle?.entry?.length).toEqual(0);
  });

  test('Stop retries if Resource deleted', async () => {
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    // At this point the job should be in the queue
    // But let's delete the resource
    const [deleteOutcome] = await repo.deleteResource('Patient', patient?.id as string);
    assertOk(deleteOutcome);

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendSubscription(job);

    // Fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();

    // No AuditEvent resources should have been created
    const [searchOutcome, bundle] = await repo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(searchOutcome);
    expect(bundle).toBeDefined();
    expect(bundle?.entry?.length).toEqual(0);
  });

  test('AuditEvent has Subscription account details', async () => {
    const project = randomUUID();
    const account = {
      reference: 'Organization/' + randomUUID(),
    };

    const [subscriptionOutcome, subscription] = await systemRepo.createResource<Subscription>({
      resourceType: 'Subscription',
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
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as any).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: {
        project,
        account,
      },
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as any).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as any as Job;
    await sendSubscription(job);

    const [searchOutcome, bundle] = await systemRepo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(searchOutcome);
    expect(bundle).toBeDefined();
    expect(bundle?.entry?.length).toEqual(1);

    const auditEvent = bundle?.entry?.[0].resource as AuditEvent;
    expect(auditEvent.meta?.account).toBeDefined();
    expect(auditEvent.meta?.account?.reference).toEqual(account.reference);
  });
});
