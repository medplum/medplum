import { Account, Observation, Operator, Patient, Reference } from '@medplum/core';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { getPatientId, repo } from './repo';

beforeAll(async () => {
  await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
});

afterAll(async () => {
  await closeDatabase();
});

test('Patient resource with identifier', async (done) => {
  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    identifier: [{ system: 'https://www.example.com', value: '123' }]
  });

  expect(createOutcome.id).toEqual('created');

  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'Patient',
    filters: [{
      code: 'identifier',
      operator: Operator.EQUALS,
      value: '123'
    }]
  });

  expect(searchOutcome.id).toEqual('ok');
  expect(searchResult?.entry?.length).toEqual(1);
  expect(searchResult?.entry?.[0]?.resource?.id).toEqual(patient?.id);
  done();
});

test('Patient resource with name', async (done) => {
  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smithbottom' }],
    identifier: [{ system: 'https://www.example.com', value: '123' }]
  });

  expect(createOutcome.id).toEqual('created');

  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'Patient',
    filters: [{
      code: 'family',
      operator: Operator.EQUALS,
      value: 'Smithbottom'
    }]
  });

  expect(searchOutcome.id).toEqual('ok');
  expect(searchResult?.entry?.length).toEqual(1);
  expect(searchResult?.entry?.[0]?.resource?.id).toEqual(patient?.id);
  done();
});

test('Repo read malformed reference', async (done) => {
  const [outcome1, resource1] = await repo.readReference({ reference: undefined });
  expect(outcome1.id).not.toBe('ok');
  expect(resource1).toBeUndefined();

  const [outcome2, resource2] = await repo.readReference({ reference: '' });
  expect(outcome2.id).not.toBe('ok');
  expect(resource2).toBeUndefined();

  const [outcome3, resource3] = await repo.readReference({ reference: '////' });
  expect(outcome3.id).not.toBe('ok');
  expect(resource3).toBeUndefined();

  const [outcome4, resource4] = await repo.readReference({ reference: 'Patient/123/foo' });
  expect(outcome4.id).not.toBe('ok');
  expect(resource4).toBeUndefined();

  done();
});

test('getPatientId', () => {
  expect(getPatientId({ subject: [] as Reference[] } as Account, ['subject'])).toBeUndefined();
  expect(getPatientId({ subject: [{}] } as Account, ['subject'])).toBeUndefined();
  expect(getPatientId({ subject: [{ reference: 'Device/123' }] } as Account, ['subject'])).toBeUndefined();
  expect(getPatientId({ subject: [{ reference: 'Patient/123' }] } as Account, ['subject'])).toBe('123');

  expect(getPatientId({} as Observation, ['subject'])).toBeUndefined();
  expect(getPatientId({ subject: {} } as Observation, ['subject'])).toBeUndefined();
  expect(getPatientId({ subject: { reference: 'Device/123' } } as Observation, ['subject'])).toBeUndefined();
  expect(getPatientId({ subject: { reference: 'Patient/123' } } as Observation, ['subject'])).toBe('123');
});

test('Update patient', async (done) => {
  const [createOutcome, patient1] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Update1'], family: 'Update1' }]
  });

  expect(createOutcome.id).toEqual('created');

  const [updateOutcome, patient2] = await repo.updateResource<Patient>({
    ...patient1 as Patient,
    active: true
  });

  expect(updateOutcome.id).toEqual('ok');
  expect(patient2?.id).toEqual(patient1?.id);
  expect(patient2?.meta?.versionId).not.toEqual(patient1?.meta?.versionId);
  done();
});

test('Update patient no changes', async (done) => {
  const [createOutcome, patient1] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Update1'], family: 'Update1' }]
  });

  expect(createOutcome.id).toEqual('created');

  const [updateOutcome, patient2] = await repo.updateResource<Patient>({
    ...patient1 as Patient
  });

  expect(updateOutcome.id).toEqual('not-modified');
  expect(patient2?.id).toEqual(patient1?.id);
  expect(patient2?.meta?.versionId).toEqual(patient1?.meta?.versionId);
  done();
});
