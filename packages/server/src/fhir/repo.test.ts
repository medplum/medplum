import { Account, Communication, createReference, Encounter, getReferenceString, Observation, Operator, Patient, Reference, SearchParameter } from '@medplum/core';
import { randomUUID } from 'crypto';
import { loadTestConfig } from '../config';
import { ADMIN_USER_ID, MEDPLUM_PROJECT_ID } from '../constants';
import { closeDatabase, initDatabase } from '../database';
import { getPatientId, repo, Repository } from './repo';

beforeAll(async () => {
  const config = await loadTestConfig();
  await initDatabase(config.database);
});

afterAll(async () => {
  await closeDatabase();
});

test('Patient resource with identifier', async () => {
  const identifier = randomUUID();

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    identifier: [{ system: 'https://www.example.com', value: identifier }]
  });

  expect(createOutcome.id).toEqual('created');

  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'Patient',
    filters: [{
      code: 'identifier',
      operator: Operator.EQUALS,
      value: identifier
    }]
  });

  expect(searchOutcome.id).toEqual('ok');
  expect(searchResult?.entry?.length).toEqual(1);
  expect(searchResult?.entry?.[0]?.resource?.id).toEqual(patient?.id);
});

test('Patient resource with name', async () => {
  const familyName = randomUUID();

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: familyName }],
    identifier: [{ system: 'https://www.example.com', value: '123' }]
  });

  expect(createOutcome.id).toEqual('created');

  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'Patient',
    filters: [{
      code: 'family',
      operator: Operator.EQUALS,
      value: familyName
    }]
  });

  expect(searchOutcome.id).toEqual('ok');
  expect(searchResult?.entry?.length).toEqual(1);
  expect(searchResult?.entry?.[0]?.resource?.id).toEqual(patient?.id);
});

test('Patient resource with address', async () => {
  const addressLine = randomUUID();
  const addressCity = randomUUID();

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    address: [{
      use: 'both',
      line: [addressLine],
      city: addressCity,
      state: 'CA',
      postalCode: '94111',
      country: 'US'
    }]
  });

  expect(createOutcome.id).toEqual('created');

  const [searchOutcome1, searchResult1] = await repo.search({
    resourceType: 'Patient',
    filters: [{
      code: 'address',
      operator: Operator.CONTAINS,
      value: addressLine
    }]
  });

  expect(searchOutcome1.id).toEqual('ok');
  expect(searchResult1?.entry?.length).toEqual(1);
  expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

  const [searchOutcome2, searchResult2] = await repo.search({
    resourceType: 'Patient',
    filters: [{
      code: 'address-city',
      operator: Operator.EQUALS,
      value: addressCity
    }]
  });

  expect(searchOutcome2.id).toEqual('ok');
  expect(searchResult2?.entry?.length).toEqual(1);
  expect(searchResult2?.entry?.[0]?.resource?.id).toEqual(patient?.id);
});

test('Patient resource with telecom', async () => {
  const email = randomUUID();
  const phone = randomUUID();

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    telecom: [
      {
        system: 'email',
        value: email
      },
      {
        system: 'phone',
        value: phone
      }
    ]
  });

  expect(createOutcome.id).toEqual('created');

  const [searchOutcome1, searchResult1] = await repo.search({
    resourceType: 'Patient',
    filters: [{
      code: 'email',
      operator: Operator.CONTAINS,
      value: email
    }]
  });

  expect(searchOutcome1.id).toEqual('ok');
  expect(searchResult1?.entry?.length).toEqual(1);
  expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

  const [searchOutcome2, searchResult2] = await repo.search({
    resourceType: 'Patient',
    filters: [{
      code: 'phone',
      operator: Operator.EQUALS,
      value: phone
    }]
  });

  expect(searchOutcome2.id).toEqual('ok');
  expect(searchResult2?.entry?.length).toEqual(1);
  expect(searchResult2?.entry?.[0]?.resource?.id).toEqual(patient?.id);
});

test('Repo read malformed reference', async () => {
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

test('Update patient', async () => {
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
});

test('Update patient no changes', async () => {
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
});

test('Update patient multiple names', async () => {
  const [createOutcome1, patient1] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Suzy'], family: 'Smith' }]
  });

  expect(createOutcome1.id).toEqual('created');

  const [updateOutcome2, patient2] = await repo.updateResource<Patient>({
    ...patient1 as Patient,
    name: [
      { given: ['Suzy'], family: 'Smith' },
      { given: ['Suzy'], family: 'Jones' }
    ]
  });

  expect(updateOutcome2.id).toEqual('ok');
  expect(patient2?.id).toEqual(patient1?.id);
  expect(patient2?.meta?.versionId).not.toEqual(patient1?.meta?.versionId);
  expect(patient2?.name?.length).toEqual(2);
  expect(patient2?.name?.[0]?.family).toEqual('Smith');
  expect(patient2?.name?.[1]?.family).toEqual('Jones');
});

test('Create Patient with no author', async () => {
  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }]
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author?.reference).toEqual('system');
});

test('Create Patient as system on behalf of author', async () => {
  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    meta: {
      author: {
        reference: 'Practitioner/' + ADMIN_USER_ID
      }
    }
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author?.reference).toEqual('Practitioner/' + ADMIN_USER_ID);
});

test('Create Patient as ClientApplication with no author', async () => {
  const clientApp = 'ClientApplication/' + randomUUID();

  const repo = new Repository({
    project: MEDPLUM_PROJECT_ID,
    author: {
      reference: clientApp
    }
  });

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }]
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author?.reference).toEqual(clientApp);
});

test('Create Patient as ClientApplication on behalf of author', async () => {
  const clientApp = 'ClientApplication/' + randomUUID();

  const repo = new Repository({
    project: MEDPLUM_PROJECT_ID,
    author: {
      reference: clientApp
    }
  });

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    meta: {
      author: {
        reference: 'Practitioner/' + ADMIN_USER_ID
      }
    }
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author?.reference).toEqual('Practitioner/' + ADMIN_USER_ID);
});

test('Create Patient as Practitioner with no author', async () => {
  const author = 'Practitioner/' + ADMIN_USER_ID;

  const repo = new Repository({
    project: MEDPLUM_PROJECT_ID,
    author: {
      reference: author
    }
  });

  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }]
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author?.reference).toEqual(author);
});

test('Create Patient as Practitioner on behalf of author', async () => {
  const author = 'Practitioner/' + ADMIN_USER_ID;
  const fakeAuthor = 'Practitioner/' + randomUUID();

  const repo = new Repository({
    project: MEDPLUM_PROJECT_ID,
    author: {
      reference: author
    }
  });

  // We are acting as a Practitioner
  // Practitioner does *not* have the right to set the author
  // So even though we pass in an author,
  // We expect the Practitioner to be in the result.
  const [createOutcome, patient] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
    meta: {
      author: {
        reference: fakeAuthor
      }
    }
  });

  expect(createOutcome.id).toEqual('created');
  expect(patient?.meta?.author?.reference).toEqual(author);
});

test('Search for Communications by Encounter', async () => {
  const [outcome1, patient1] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }]
  });

  expect(outcome1.id).toEqual('created');
  expect(patient1).not.toBeUndefined();

  const [outcome2, encounter1] = await repo.createResource<Encounter>({
    resourceType: 'Encounter',
    'class': {
      code: 'HH',
      display: 'home health'
    },
    subject: createReference(patient1 as Patient)
  });

  expect(outcome2.id).toEqual('created');
  expect(encounter1).not.toBeUndefined();

  const [outcome3, comm1] = await repo.createResource<Communication>({
    resourceType: 'Communication',
    encounter: createReference(encounter1 as Encounter),
    subject: createReference(patient1 as Patient),
    sender: createReference(patient1 as Patient),
    payload: [{ contentString: 'This is a test' }]
  });

  expect(outcome3.id).toEqual('created');
  expect(comm1).not.toBeUndefined();

  const [outcome4, patient2] = await repo.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Bob'], family: 'Jones' }]
  });

  expect(outcome4.id).toEqual('created');
  expect(patient2).not.toBeUndefined();

  const [outcome5, encounter2] = await repo.createResource<Encounter>({
    resourceType: 'Encounter',
    'class': {
      code: 'HH',
      display: 'home health'
    },
    subject: createReference(patient2 as Patient)
  });

  expect(outcome5.id).toEqual('created');
  expect(encounter2).not.toBeUndefined();

  const [outcome6, comm2] = await repo.createResource<Communication>({
    resourceType: 'Communication',
    encounter: createReference(encounter2 as Encounter),
    subject: createReference(patient2 as Patient),
    sender: createReference(patient2 as Patient),
    payload: [{ contentString: 'This is another test' }]
  });

  expect(outcome6.id).toEqual('created');
  expect(comm2).not.toBeUndefined();

  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'Communication',
    filters: [{
      code: 'encounter',
      operator: Operator.EQUALS,
      value: getReferenceString(encounter1 as Encounter)
    }]
  });

  expect(searchOutcome.id).toEqual('ok');
  expect(searchResult?.entry?.length).toEqual(1);
  expect(searchResult?.entry?.[0]?.resource?.id).toEqual(comm1?.id);
});

test('Search for token in array', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'SearchParameter',
    filters: [{
      code: 'base',
      operator: Operator.EQUALS,
      value: 'Patient'
    }],
    count: 100
  });

  expect(outcome.id).toEqual('ok');
  expect(bundle?.entry?.find(e => (e.resource as SearchParameter).code === 'name')).not.toBeUndefined();
  expect(bundle?.entry?.find(e => (e.resource as SearchParameter).code === 'email')).not.toBeUndefined();
});

test('Search sort by Patient.id', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'Patient',
    sortRules: [{ code: 'id' }]
  });

  expect(outcome.id).toEqual('ok');
});

test('Search sort by Patient.meta.lastUpdated', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'Patient',
    sortRules: [{ code: 'lastUpdated' }]
  });

  expect(outcome.id).toEqual('ok');
});

test('Search sort by Patient.identifier', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'Patient',
    sortRules: [{ code: 'identifier' }]
  });

  expect(outcome.id).toEqual('ok');
});

test('Search sort by Patient.name', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'Patient',
    sortRules: [{ code: 'name' }]
  });

  expect(outcome.id).toEqual('ok');
});

test('Search sort by Patient.given', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'Patient',
    sortRules: [{ code: 'given' }]
  });

  expect(outcome.id).toEqual('ok');
});

test('Search sort by Patient.address', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'Patient',
    sortRules: [{ code: 'address' }]
  });

  expect(outcome.id).toEqual('ok');
});

test('Search sort by Patient.telecom', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'Patient',
    sortRules: [{ code: 'telecom' }]
  });

  expect(outcome.id).toEqual('ok');
});

test('Search sort by Patient.email', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'Patient',
    sortRules: [{ code: 'email' }]
  });

  expect(outcome.id).toEqual('ok');
});

test('Search sort by Patient.birthDate', async () => {
  const [outcome, bundle] = await repo.search({
    resourceType: 'Patient',
    sortRules: [{ code: 'birthdate' }]
  });

  expect(outcome.id).toEqual('ok');
});
