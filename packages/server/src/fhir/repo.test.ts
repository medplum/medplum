import { Account, Observation, Operator, Patient, Reference } from '@medplum/core';
import { randomUUID } from 'crypto';
import { loadConfig } from '../config';
import { ADMIN_USER_ID, MEDPLUM_PROJECT_ID } from '../constants';
import { closeDatabase, initDatabase } from '../database';
import { getPatientId, repo, Repository } from './repo';

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

test('Create Patient with no author', async (done) => {
  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }]
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author).toEqual('system');
  done();
});

test('Create Patient as system on behalf of author', async (done) => {
  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    meta: {
      author: 'Practitioner/' + ADMIN_USER_ID
    }
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author).toEqual('Practitioner/' + ADMIN_USER_ID);
  done();
});

test('Create Patient as ClientApplication with no author', async (done) => {
  const clientApp = 'ClientApplication/' + randomUUID();

  const repo = new Repository({
    project: MEDPLUM_PROJECT_ID,
    author: clientApp
  });

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }]
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author).toEqual(clientApp);
  done();
});

test('Create Patient as ClientApplication on behalf of author', async (done) => {
  const clientApp = 'ClientApplication/' + randomUUID();

  const repo = new Repository({
    project: MEDPLUM_PROJECT_ID,
    author: clientApp
  });

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    meta: {
      author: 'Practitioner/' + ADMIN_USER_ID
    }
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author).toEqual('Practitioner/' + ADMIN_USER_ID);
  done();
});

test('Create Patient as Practitioner with no author', async (done) => {
  const author = 'Practitioner/' + ADMIN_USER_ID;

  const repo = new Repository({
    project: MEDPLUM_PROJECT_ID,
    author
  });

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }]
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author).toEqual(author);
  done();
});

test('Create Patient as Practitioner on behalf of author', async (done) => {
  const author = 'Practitioner/' + ADMIN_USER_ID;
  const fakeAuthor = 'Practitioner/' + randomUUID();

  const repo = new Repository({
    project: MEDPLUM_PROJECT_ID,
    author: author
  });

  // We are acting as a Practitioner
  // Practitioner does *not* have the right to set the author
  // So even though we pass in an author,
  // We expect the Practitioner to be in the result.
  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    meta: {
      author: fakeAuthor
    }
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author).toEqual(author);
  done();
});
