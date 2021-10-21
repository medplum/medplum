import { Bundle, BundleEntry, isOk } from '@medplum/core';
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

  test('Create batch with missing bundle type', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle'
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0].details?.text).toContain('Missing bundle type');
    expect(bundle).toBeUndefined();
  });

  test('Create batch with invalid bundle type', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'xyz'
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0].details?.text).toContain('Unrecognized bundle type');
    expect(bundle).toBeUndefined();
  });

  test('Create batch with missing entries', async () => {
    const [outcome, bundle] = await processBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch'
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0].details?.text).toContain('Missing bundle entry');
    expect(bundle).toBeUndefined();
  });

  test('Create batch success', async () => {
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
          // Empty entry
        },
        {
          // Resource without id or urn:uuid
          resource: {
            resourceType: 'Patient'
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
    expect(results.length).toEqual(6);
    expect(results[0].response?.status).toEqual('201');
    expect(results[1].response?.status).toEqual('201');
    expect(results[2].response?.status).toEqual('400');
    expect(results[3].response?.status).toEqual('400');
    expect(results[4].response?.status).toEqual('200');
    expect(results[4].resource).not.toBeUndefined();
    expect((results[4].resource as Bundle).entry?.length).toEqual(1);
    expect(results[5].response?.status).toEqual('404');
  });

});
