import { Operator, Patient } from '@medplum/core';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { repo } from './repo';

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

  expect(createOutcome.id).toEqual('ok');

  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'Patient',
    filters: [{
      code: 'identifier',
      operator: Operator.EQUALS,
      value: '123'
    }]
  });

  expect(searchOutcome.id).toEqual('ok');
  console.log(JSON.stringify(searchResult, undefined, 2));
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

  expect(createOutcome.id).toEqual('ok');

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
