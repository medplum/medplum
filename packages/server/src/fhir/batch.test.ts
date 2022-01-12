import { assertOk, isOk } from '@medplum/core';
import { Bundle, BundleEntry, Observation, OperationOutcome, Patient, Subscription } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { seedDatabase } from '../seed';
import { processBatch } from './batch';
import { Repository } from './repo';

let repo: Repository;

describe('Batch', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();

    repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'ClientApplication/' + randomUUID(),
      },
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Process batch with missing bundle type', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0].details?.text).toContain('Missing bundle type');
    expect(bundle).toBeUndefined();
  });

  test('Process batch with invalid bundle type', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'xyz',
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0].details?.text).toContain('Unrecognized bundle type');
    expect(bundle).toBeUndefined();
  });

  test('Process batch with missing entries', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0].details?.text).toContain('Missing bundle entry');
    expect(bundle).toBeUndefined();
  });

  test('Process batch success', async () => {
    const authorId = randomUUID();
    const projectId = randomUUID();
    const patientId = randomUUID();
    const observationId = randomUUID();

    // Be sure to act as a user without 'write meta' permissions.
    // Need to verify that normal users can link urn:uuid requests.
    const userRepo = new Repository({
      author: {
        reference: 'Practitioner/' + authorId,
      },
      project: projectId,
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Patient' }, { resourceType: 'Observation' }],
      },
    });

    const [outcome, bundle] = await processBatch(userRepo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: 'urn:uuid:' + patientId,
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            id: patientId,
          },
        },
        {
          fullUrl: 'urn:uuid:' + observationId,
          request: {
            method: 'POST',
            url: 'Observation',
          },
          resource: {
            resourceType: 'Observation',
            id: observationId,
            subject: {
              reference: 'urn:uuid:' + patientId,
            },
            code: {
              text: 'test',
            },
          },
        },
        {
          // Search
          request: {
            method: 'GET',
            url: 'Patient?_count=1',
          },
        },
        {
          // Read resource
          request: {
            method: 'GET',
            url: 'Patient/' + randomUUID(),
          },
        },
        {
          // Delete resource
          request: {
            method: 'DELETE',
            url: 'Patient/' + randomUUID(),
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.type).toEqual('batch-response');
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(5);
    expect(results[0].response?.status).toEqual('201');
    expect(results[1].response?.status).toEqual('201');
    expect(results[2].response?.status).toEqual('200');
    expect(results[2].resource).toBeDefined();
    expect((results[2].resource as Bundle).entry?.length).toEqual(1);
    expect(results[3].response?.status).toEqual('404');
    expect(results[4].response?.status).toEqual('404');

    const [patientOutcome, patient] = await userRepo.readReference({
      reference: results[0].response?.location as string,
    });
    expect(isOk(patientOutcome)).toBe(true);
    expect(patient).toBeDefined();

    const [observationOutcome, observation] = await userRepo.readReference({
      reference: results[1].response?.location as string,
    });
    expect(isOk(observationOutcome)).toBe(true);
    expect(observation).toBeDefined();
    expect((observation as Observation).subject?.reference).toEqual('Patient/' + patient?.id);
  });

  test('Process batch create success', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('201');
  });

  test('Process batch create missing resource', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
  });

  test('Process batch create missing resourceType', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {} as any,
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
  });

  test('Process batch create missing required properties', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Observation',
          },
          resource: {
            resourceType: 'Observation',
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
  });

  test('Process batch create ignore http fullUrl', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: 'https://example.com/ignore-this',
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('201');
  });

  test('Process batch create does not rewrite identifier', async () => {
    const id = randomUUID();

    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: 'urn:uuid:' + id,
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            id,
            identifier: [
              {
                system: 'https://github.com/synthetichealth/synthea',
                value: id,
              },
            ],
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('201');

    const [readOutcome, readResult] = await repo.readReference({
      reference: results[0].response?.location as string,
    });
    expect(isOk(readOutcome)).toBe(true);
    expect(readResult).toBeDefined();
    expect((readResult as Patient).identifier?.[0]?.value).toEqual(id);
  });

  test('Process batch create ifNoneExist success', async () => {
    const identifier = randomUUID();

    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=' + identifier,
          },
          resource: {
            resourceType: 'Patient',
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=' + identifier,
          },
          resource: {
            resourceType: 'Patient',
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(2);
    expect(results[0].response?.status).toEqual('201');
    expect(results[1].response?.status).toEqual('200');
    expect(results[1].response?.location).toEqual(results[0].response?.location);
  });

  test('Process batch create ifNoneExist invalid resource type', async () => {
    const identifier = randomUUID();

    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'XXX',
            ifNoneExist: 'identifier=' + identifier,
          },
          resource: {
            resourceType: 'XXX',
          } as any,
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
  });

  test('Process batch create ifNoneExist multiple matches', async () => {
    const identifier = randomUUID();

    // This is a bit contrived...
    // First, intentionally create 2 patients with duplicate identifiers
    // Then, the 3rd entry use ifNoneExists
    // The search will return 2 patients, which causes the entry to fail
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=' + identifier,
          },
          resource: {
            resourceType: 'Patient',
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(3);
    expect(results[0].response?.status).toEqual('201');
    expect(results[1].response?.status).toEqual('201');
    expect(results[2].response?.status).toEqual('400');
  });

  test('Process batch update', async () => {
    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
    });
    assertOk(patientOutcome, patient);

    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PUT',
            url: 'Patient/' + patient?.id,
          },
          resource: {
            ...patient,
            active: true,
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('200');
  });

  test('Process batch update missing resource', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PUT',
            url: 'Patient/' + randomUUID(),
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
  });

  test('Process batch missing request', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          // Empty entry
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Missing entry.request'
    );
  });

  test('Process batch delete', async () => {
    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
    });
    assertOk(patientOutcome, patient);

    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'DELETE',
            url: 'Patient/' + patient.id,
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('200');
  });

  test('Process batch delete invalid URL', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'DELETE',
            url: 'Patient',
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('404');
  });

  test('Process batch missing request.method', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Missing entry.request.method'
    );
  });

  test('Process batch unsupported request.method', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'XXX',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Unsupported entry.request.method'
    );
  });

  test('Process batch missing request.url', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
          },
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Missing entry.request.url'
    );
  });

  test('Process batch not found', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'GET',
            url: 'x/x/x/x/x',
          },
        },
        {
          request: {
            method: 'POST',
            url: 'x/x/x/x/x',
          },
        },
        {
          request: {
            method: 'PUT',
            url: 'x/x/x/x/x',
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(3);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].response?.status).toEqual('404');
    }
  });

  test('Process batch read history', async () => {
    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ family: 'Foo', given: ['Bar'] }],
    });
    assertOk(createOutcome, patient);

    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'GET',
            url: `Patient/${patient.id}/_history`,
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.entry).toBeDefined();
  });

  test('Embedded urn:uuid', async () => {
    const authorId = randomUUID();
    const projectId = randomUUID();

    const userRepo = new Repository({
      author: {
        reference: 'Practitioner/' + authorId,
      },
      project: projectId,
    });

    const [outcome, bundle] = await processBatch(userRepo, {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb',
          request: {
            method: 'POST',
            url: 'Questionnaire',
          },
          resource: {
            resourceType: 'Questionnaire',
            name: 'Example Questionnaire',
            title: 'Example Questionnaire',
            item: [
              {
                linkId: 'q1',
                type: 'string',
                text: 'Question',
              },
            ],
          },
        },
        {
          fullUrl: 'urn:uuid:14b4f91f-1119-40b8-b10e-3db77cf1c191',
          request: {
            method: 'POST',
            url: 'Subscription',
          },
          resource: {
            resourceType: 'Subscription',
            status: 'active',
            criteria: 'QuestionnaireResponse?questionnaire=urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb',
            channel: {
              type: 'rest-hook',
              endpoint: 'urn:uuid:32178250-67a4-4ec9-89bc-d16f1d619403',
              payload: 'application/fhir+json',
            },
          },
        },
      ],
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).toBeDefined();
    expect(bundle?.type).toEqual('batch-response');
    expect(bundle?.entry).toBeDefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(2);
    expect(results[0].response?.status).toEqual('201');
    expect(results[1].response?.status).toEqual('201');

    const [subscriptionOutcome, subscription] = await userRepo.readReference<Subscription>({
      reference: results[1].response?.location as string,
    });
    assertOk(subscriptionOutcome, subscription);
    expect(subscription.criteria).toMatch(
      /QuestionnaireResponse\?questionnaire=Questionnaire\/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/
    );
  });
});
