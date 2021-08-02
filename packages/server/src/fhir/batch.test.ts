import { randomUUID } from 'crypto';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { createBatch } from './batch';
import { isOk } from './outcomes';
import { repo } from './repo';

beforeAll(async () => {
  const config = await loadTestConfig();
  await initDatabase(config.database);
});

afterAll(async () => {
  await closeDatabase();
});

test('Create batch with missing bundle type', async (done) => {
  const [outcome, bundle] = await createBatch(repo, {
    resourceType: 'Bundle'
  });

  expect(isOk(outcome)).toBe(false);
  expect(outcome.issue?.[0].details?.text).toContain('Missing bundle type');
  expect(bundle).toBeUndefined();
  done();
});

test('Create batch with invalid bundle type', async (done) => {
  const [outcome, bundle] = await createBatch(repo, {
    resourceType: 'Bundle',
    type: 'xyz'
  });

  expect(isOk(outcome)).toBe(false);
  expect(outcome.issue?.[0].details?.text).toContain('Unrecognized bundle type');
  expect(bundle).toBeUndefined();
  done();
});

test('Create batch with missing entries', async (done) => {
  const [outcome, bundle] = await createBatch(repo, {
    resourceType: 'Bundle',
    type: 'batch'
  });

  expect(isOk(outcome)).toBe(false);
  expect(outcome.issue?.[0].details?.text).toContain('Missing bundle entry');
  expect(bundle).toBeUndefined();
  done();
});

test('Create batch success', async (done) => {
  const patientId = randomUUID();
  const observationId = randomUUID();

  const [outcome, bundle] = await createBatch(repo, {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [
      {
        fullUrl: 'urn:uuid:' + patientId,
        resource: {
          resourceType: 'Patient',
          id: patientId
        }
      },
      {
        fullUrl: 'urn:uuid:' + observationId,
        resource: {
          resourceType: 'Observation',
          id: observationId,
          subject: {
            reference: 'Patient/' + patientId
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
      }
    ]
  });

  expect(isOk(outcome)).toBe(true);
  expect(bundle).not.toBeUndefined();
  done();
});

