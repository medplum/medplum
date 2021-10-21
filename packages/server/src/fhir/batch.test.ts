import { assertOk, Bundle, BundleEntry, isOk, OperationOutcome, Patient } from '@medplum/core';
import { randomUUID } from 'crypto';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { processBatch } from './batch';
import { repo } from './repo';

describe('Batch', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Process batch with missing bundle type', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle'
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0].details?.text).toContain('Missing bundle type');
    expect(bundle).toBeUndefined();
  });

  test('Process batch with invalid bundle type', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'xyz'
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0].details?.text).toContain('Unrecognized bundle type');
    expect(bundle).toBeUndefined();
  });

  test('Process batch with missing entries', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch'
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0].details?.text).toContain('Missing bundle entry');
    expect(bundle).toBeUndefined();
  });

  test('Process batch success', async () => {
    const patientId = randomUUID();
    const observationId = randomUUID();

    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: 'urn:uuid:' + patientId,
          request: {
            method: 'POST',
            url: 'Patient'
          },
          resource: {
            resourceType: 'Patient',
            id: patientId
          }
        },
        {
          fullUrl: 'urn:uuid:' + observationId,
          request: {
            method: 'POST',
            url: 'Observation'
          },
          resource: {
            resourceType: 'Observation',
            id: observationId,
            subject: {
              reference: 'Patient/' + patientId
            },
            code: {
              text: 'test'
            }
          }
        },
        {
          // Search
          request: {
            method: 'GET',
            url: 'Patient?_count=1'
          },
        },
        {
          // Read resource
          request: {
            method: 'GET',
            url: 'Patient/' + randomUUID()
          },
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(4);
    expect(results[0].response?.status).toEqual('201');
    expect(results[1].response?.status).toEqual('201');
    expect(results[2].response?.status).toEqual('200');
    expect(results[2].resource).not.toBeUndefined();
    expect((results[2].resource as Bundle).entry?.length).toEqual(1);
    expect(results[3].response?.status).toEqual('404');
  });

  test('Process batch create success', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient'
          },
          resource: {
            resourceType: 'Patient'
          }
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

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
            url: 'Patient'
          }
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
  });

  test('Process batch update', async () => {
    const [patientOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient'
    });
    assertOk(patientOutcome);

    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PUT',
            url: 'Patient/' + patient?.id
          },
          resource: {
            ...(patient as Patient),
            active: true
          }
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

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
            url: 'Patient/' + randomUUID()
          }
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

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
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual('Missing entry.request');
  });

  test('Process batch missing request.method', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            url: 'Patient'
          },
          resource: {
            resourceType: 'Patient'
          }
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual('Missing entry.request.method');
  });

  test('Process batch unsupported request.method', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'XXX',
            url: 'Patient'
          },
          resource: {
            resourceType: 'Patient'
          }
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual('Unsupported entry.request.method');
  });

  test('Process batch missing request.url', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST'
          },
          resource: {
            resourceType: 'Patient'
          }
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual('Missing entry.request.url');
  });

  test('Process batch not found', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'GET',
            url: 'x/x/x/x/x'
          }
        },
        {
          request: {
            method: 'POST',
            url: 'x/x/x/x/x'
          }
        },
        {
          request: {
            method: 'PUT',
            url: 'x/x/x/x/x'
          }
        }
      ]
    });

    expect(isOk(outcome)).toBe(true);
    expect(bundle).not.toBeUndefined();
    expect(bundle?.entry).not.toBeUndefined();

    const results = bundle?.entry as BundleEntry[];
    expect(results.length).toEqual(3);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].response?.status).toEqual('404');
    }
  });

});
