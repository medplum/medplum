import { assertOk, createReference, getReferenceString, Operator, stringify } from '@medplum/core';
import {
  AccessPolicy,
  AuditEvent,
  Bot,
  Observation,
  Patient,
  Practitioner,
  Project,
  ProjectMembership,
  QuestionnaireResponse,
  Subscription,
} from '@medplum/fhirtypes';
import { Job, Queue } from 'bullmq';
import { createHmac, randomUUID } from 'crypto';
import fetch from 'node-fetch';
import { loadTestConfig } from '../config';
import { closeDatabase, getClient, initDatabase } from '../database';
import { getRepoForMembership, Repository, systemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';
import { seedDatabase } from '../seed';
import { closeSubscriptionWorker, execSubscriptionJob, initSubscriptionWorker } from './subscription';

jest.mock('bullmq');
jest.mock('node-fetch');

let repo: Repository;
let botRepo: Repository;
let botProject: Project;

describe('Subscription Worker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initSubscriptionWorker(config.redis);

    // Create one simple project with no advanced features enabled
    const [testProjectOutcome, testProject] = await systemRepo.createResource<Project>({
      resourceType: 'Project',
      name: 'Test Project',
      owner: {
        reference: 'User/' + randomUUID(),
      },
    });
    assertOk(testProjectOutcome, testProject);

    repo = new Repository({
      project: testProject.id,
      author: {
        reference: 'ClientApplication/' + randomUUID(),
      },
    });

    // Create another project, this one with bots enabled
    const botProjectDetails = await createTestProject();
    botProject = botProjectDetails.project;
    botRepo = new Repository({
      project: botProjectDetails.project.id,
      author: createReference(botProjectDetails.client),
    });
  });

  afterAll(async () => {
    await closeDatabase();
    await closeSubscriptionWorker();
    await closeSubscriptionWorker(); // Double close to ensure quite ignore
  });

  beforeEach(async () => {
    await getClient().query('DELETE FROM "Subscription"');
    (fetch as unknown as jest.Mock).mockClear();
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
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
    // Create a subscription in project 1
    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: 'https://example.com/subscription',
      },
    });
    expect(subscriptionOutcome.id).toEqual('created');
    expect(subscription).toBeDefined();

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    // Create a patient in project 2
    const [patientOutcome, patient] = await botRepo.createResource<Patient>({
      resourceType: 'Patient',
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
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

  test('Retry on 429', async () => {
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 429 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execSubscriptionJob(job)).rejects.toThrow();
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as jest.Mock).mockImplementation(() => {
      throw new Error();
    });

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;

    // If the job throws, then the QueueScheduler will retry
    await expect(execSubscriptionJob(job)).rejects.toThrow();
  });

  test('Ignore bots if feature not enabled', async () => {
    const nonce = randomUUID();

    const [botOutcome, bot] = await repo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
      description: 'Test Bot',
      code: `console.log('${nonce}');`,
    });
    assertOk(botOutcome, bot);

    const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/' + bot.meta?.project },
      user: createReference(bot),
      profile: createReference(bot),
    });
    assertOk(membershipOutcome, membership);

    const [subscriptionOutcome, subscription] = await repo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: getReferenceString(bot as Bot),
      },
    });
    assertOk(subscriptionOutcome, subscription);

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });
    assertOk(patientOutcome, patient);
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);
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
    assertOk(searchOutcome, bundle);
    expect(bundle.entry?.length).toEqual(1);

    const auditEvent = bundle.entry?.[0]?.resource as AuditEvent;
    expect(auditEvent.outcomeDesc).toEqual('Bots not enabled');
  });

  test('Execute bot subscriptions', async () => {
    const nonce = randomUUID();

    const [botOutcome, bot] = await botRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
      description: 'Test Bot',
      code: `console.log('${nonce}');`,
    });
    assertOk(botOutcome, bot);

    const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/' + bot.meta?.project },
      user: createReference(bot),
      profile: createReference(bot),
    });
    assertOk(membershipOutcome, membership);

    const [subscriptionOutcome, subscription] = await botRepo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: getReferenceString(bot as Bot),
      },
    });
    assertOk(subscriptionOutcome, subscription);

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await botRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);
    expect(fetch).not.toHaveBeenCalled();

    const [searchOutcome, bundle] = await botRepo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(searchOutcome, bundle);
    expect(bundle.entry?.length).toEqual(1);
    expect(bundle.entry?.[0]?.resource?.outcome).toEqual('0');
    expect(bundle.entry?.[0]?.resource?.outcomeDesc).toContain(nonce);
  });

  test('Bot run as user', async () => {
    const nonce = randomUUID();

    // Create a bot
    // This bot takes a QuestionnaireResponse as an input
    // And creates a patient as an output
    const [botOutcome, bot] = await botRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
      description: 'Test Bot',
      code: `
        const [outcome, patient] = await repo.createResource({
          resourceType: 'Patient',
          name: [{ family: resource.item[0].answer[0].valueString }],
        });
        assertOk(outcome, patient);
      `,
      runAsUser: true,
    });
    assertOk(botOutcome, bot);

    // Create the subscription that listens for QuestionnaireResponses
    const [subscriptionOutcome, subscription] = await botRepo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'QuestionnaireResponse',
      channel: {
        type: 'rest-hook',
        endpoint: getReferenceString(bot as Bot),
      },
    });
    assertOk(subscriptionOutcome, subscription);

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [qrOutcome, qr] = await botRepo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      item: [
        {
          linkId: 'q1',
          answer: [
            {
              valueString: nonce,
            },
          ],
        },
      ],
    });
    assertOk(qrOutcome, qr);
    expect(queue.add).toHaveBeenCalled();

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);

    const [auditEventOutcome, auditEventBundle] = await botRepo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(auditEventOutcome, auditEventBundle);
    expect(auditEventBundle.entry?.length).toEqual(1);
    expect(auditEventBundle.entry?.[0]?.resource?.outcome).toEqual('0');

    // Search for the new patient
    // 1) This patient should exist
    // 2) In the meta, the author should be the client, not the bot
    const [patientOutcome, patientBundle] = await botRepo.search<Patient>({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.CONTAINS,
          value: nonce,
        },
      ],
    });
    assertOk(patientOutcome, patientBundle);
    expect(patientBundle.entry?.length).toEqual(1);
    expect(patientBundle.entry?.[0]?.resource?.name?.[0]?.family).toEqual(nonce);
    expect(patientBundle.entry?.[0]?.resource?.meta?.author?.reference?.startsWith('ClientApplication')).toBe(true);
  });

  test('Bot run as user with restricted access policy', async () => {
    const nonce = randomUUID();

    // Create a practitioner profile
    const [practitionerOutcome, practitioner] = await botRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
    });
    assertOk(practitionerOutcome, practitioner);

    // Create an access policy
    // Can only access QuestionnaireResponse resources
    const [accessPolicyOutcome, accessPolicy] = await botRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'QuestionnaireResponse',
        },
      ],
    });
    assertOk(accessPolicyOutcome, accessPolicy);

    // Create a membership for the practitioner and the access policy
    const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: createReference(botProject),
      profile: createReference(practitioner),
      accessPolicy: createReference(accessPolicy),
      user: {
        reference: 'User/' + randomUUID(),
      },
    });
    assertOk(membershipOutcome, membership);

    // Create a bot
    // This bot takes a QuestionnaireResponse as an input
    // It just performs a patient search
    // The new practitioner user does not have access to patients, so this will fail.
    const [botOutcome, bot] = await botRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
      description: 'Test Bot',
      code: `
        const [outcome, patient] = await repo.search({
          resourceType: 'Patient',
        });
        assertOk(outcome, patient);
      `,
      runAsUser: true,
    });
    assertOk(botOutcome, bot);

    // Create the subscription that listens for QuestionnaireResponses
    const [subscriptionOutcome, subscription] = await botRepo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'QuestionnaireResponse',
      channel: {
        type: 'rest-hook',
        endpoint: getReferenceString(bot as Bot),
      },
    });
    assertOk(subscriptionOutcome, subscription);

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    // Start acting as the user
    const userRepo = await getRepoForMembership(membership);

    const [qrOutcome, qr] = await userRepo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      item: [
        {
          linkId: 'q1',
          answer: [
            {
              valueString: nonce,
            },
          ],
        },
      ],
    });
    assertOk(qrOutcome, qr);
    expect(queue.add).toHaveBeenCalled();

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);

    const [auditEventOutcome, auditEventBundle] = await botRepo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(auditEventOutcome, auditEventBundle);
    expect(auditEventBundle.entry?.length).toEqual(1);
    expect(auditEventBundle.entry?.[0]?.resource?.outcome).toEqual('4');
  });

  test('Bot run as user with readonly access policy', async () => {
    const nonce = randomUUID();

    // Create a practitioner profile
    const [practitionerOutcome, practitioner] = await botRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
    });
    assertOk(practitionerOutcome, practitioner);

    // Create an access policy
    // Patients are readonly
    const [accessPolicyOutcome, accessPolicy] = await botRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'QuestionnaireResponse',
        },
        {
          resourceType: 'Patient',
          readonly: true,
        },
      ],
    });
    assertOk(accessPolicyOutcome, accessPolicy);

    // Create a membership for the practitioner and the access policy
    const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: createReference(botProject),
      profile: createReference(practitioner),
      accessPolicy: createReference(accessPolicy),
      user: {
        reference: 'User/' + randomUUID(),
      },
    });
    assertOk(membershipOutcome, membership);

    // Create a bot
    // This bot takes a QuestionnaireResponse as an input
    // And creates a patient as an output
    const [botOutcome, bot] = await botRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
      description: 'Test Bot',
      code: `
        const [outcome, patient] = await repo.createResource({
          resourceType: 'Patient',
          name: [{ family: resource.item[0].answer[0].valueString }],
        });
        assertOk(outcome, patient);
      `,
      runAsUser: true,
    });
    assertOk(botOutcome, bot);

    // Create the subscription that listens for QuestionnaireResponses
    const [subscriptionOutcome, subscription] = await botRepo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'QuestionnaireResponse',
      channel: {
        type: 'rest-hook',
        endpoint: getReferenceString(bot as Bot),
      },
    });
    assertOk(subscriptionOutcome, subscription);

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    // Start acting as the user
    const userRepo = await getRepoForMembership(membership);

    const [qrOutcome, qr] = await userRepo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      item: [
        {
          linkId: 'q1',
          answer: [
            {
              valueString: nonce,
            },
          ],
        },
      ],
    });
    assertOk(qrOutcome, qr);
    expect(queue.add).toHaveBeenCalled();

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);

    const [auditEventOutcome, auditEventBundle] = await botRepo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(auditEventOutcome, auditEventBundle);
    expect(auditEventBundle.entry?.length).toEqual(1);
    expect(auditEventBundle.entry?.[0]?.resource?.outcome).toEqual('4');

    // Search for the new patient
    // No patient should be created
    const [patientOutcome, patientBundle] = await botRepo.search<Patient>({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.CONTAINS,
          value: nonce,
        },
      ],
    });
    assertOk(patientOutcome, patientBundle);
    expect(patientBundle.entry?.length).toEqual(0);
  });

  test('Async Bot with await', async () => {
    const code = `
      const [outcome, appointment] = await repo.createResource({
        resourceType: 'Appointment',
        status: 'booked',
        start: new Date().toISOString(),
        participant: [
          {
            actor: createReference(resource),
            status: 'accepted',
          },
        ],
      });
      assertOk(outcome, appointment);
      console.log(JSON.stringify(appointment, null, 2));
      return appointment;
    `;

    const [botOutcome, bot] = await botRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
      description: 'Test Bot',
      code,
    });
    assertOk(botOutcome, bot);

    const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/' + bot.meta?.project },
      user: createReference(bot),
      profile: createReference(bot),
    });
    assertOk(membershipOutcome, membership);

    const [subscriptionOutcome, subscription] = await botRepo.createResource<Subscription>({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: getReferenceString(bot as Bot),
      },
    });
    assertOk(subscriptionOutcome, subscription);

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await botRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);
    expect(fetch).not.toHaveBeenCalled();

    const [searchOutcome, bundle] = await botRepo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(searchOutcome, bundle);
    expect(bundle.entry?.length).toEqual(1);
    expect(bundle.entry?.[0]?.resource?.outcome).toEqual('0');
    expect(bundle.entry?.[0]?.resource?.outcomeDesc).toContain('"resourceType": "Appointment"');
  });

  test('Bot failure', async () => {
    const nonce = randomUUID();

    const [botOutcome, bot] = await botRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
      description: 'Test Bot',
      code: `throw new Error('${nonce}');`,
    });
    assertOk(botOutcome, bot);

    const [membershipOutcome, membership] = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/' + bot.meta?.project },
      user: createReference(bot),
      profile: createReference(bot),
    });
    assertOk(membershipOutcome, membership);

    const [subscriptionOutcome, subscription] = await botRepo.createResource<Subscription>({
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await botRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patientOutcome.id).toEqual('created');
    expect(patient).toBeDefined();
    expect(queue.add).toHaveBeenCalled();

    (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);
    expect(fetch).not.toHaveBeenCalled();

    const [searchOutcome, bundle] = await botRepo.search<AuditEvent>({
      resourceType: 'AuditEvent',
      filters: [
        {
          code: 'entity',
          operator: Operator.EQUALS,
          value: getReferenceString(subscription as Subscription),
        },
      ],
    });
    assertOk(searchOutcome, bundle);
    expect(bundle.entry?.length).toEqual(1);
    expect(bundle.entry?.[0]?.resource?.outcome).not.toEqual('0');
    expect(bundle.entry?.[0]?.resource?.outcomeDesc).toContain('Error');
    expect(bundle.entry?.[0]?.resource?.outcomeDesc).toContain(nonce);
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
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

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);

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
    assertOk(searchOutcome, bundle);
    expect(bundle.entry?.length).toEqual(0);
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    assertOk(patientOutcome, patient);
    expect(queue.add).toHaveBeenCalled();

    // At this point the job should be in the queue
    // But let's delete the subscription
    const [deleteOutcome] = await repo.deleteResource('Subscription', subscription?.id as string);
    assertOk(deleteOutcome, subscription);

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);

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
    assertOk(searchOutcome, bundle);
    expect(bundle.entry?.length).toEqual(0);
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
    queue.add.mockClear();

    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    assertOk(patientOutcome, patient);
    expect(queue.add).toHaveBeenCalled();

    // At this point the job should be in the queue
    // But let's delete the resource
    const [deleteOutcome] = await repo.deleteResource('Patient', patient.id as string);
    assertOk(deleteOutcome, patient);

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);

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
    assertOk(searchOutcome, bundle);
    expect(bundle.entry?.length).toEqual(0);
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

    const queue = (Queue as unknown as jest.Mock).mock.instances[0];
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

    (fetch as unknown as jest.Mock).mockImplementation(() => ({ status: 200 }));

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    await execSubscriptionJob(job);

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
    assertOk(searchOutcome, bundle);
    expect(bundle.entry?.length).toEqual(1);

    const auditEvent = bundle?.entry?.[0].resource as AuditEvent;
    expect(auditEvent.meta?.account).toBeDefined();
    expect(auditEvent.meta?.account?.reference).toEqual(account.reference);
  });
});
