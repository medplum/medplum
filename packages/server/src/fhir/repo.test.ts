import { AccessPolicy, Account, assertOk, ClientApplication, Communication, createReference, Encounter, getReferenceString, isOk, Login, Observation, Operator, Patient, Reference, RegisterRequest, SearchParameter, ServiceRequest } from '@medplum/core';
import { randomUUID } from 'crypto';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { MEDPLUM_CLIENT_APPLICATION_ID, MEDPLUM_PROJECT_ID } from '../constants';
import { closeDatabase, initDatabase } from '../database';
import { tryLogin } from '../oauth';
import { createBatch } from './batch';
import { getPatientId, getRepoForLogin, repo, Repository } from './repo';

describe('FHIR Repo', () => {

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

  test('Create Patient with custom ID', async () => {
    const author = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      project: MEDPLUM_PROJECT_ID,
      author: {
        reference: author
      }
    });

    // Try to "update" a resource, which does not exist.
    // Some FHIR systems allow users to set ID's.
    // We do not.
    const [createOutcome, patient] = await repo.updateResource<Patient>({
      resourceType: 'Patient',
      id: randomUUID(),
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(createOutcome.id).toEqual('not-found');
    expect(patient).toBeUndefined();
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
    const author = 'Practitioner/' + randomUUID();
    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        author: {
          reference: author
        }
      }
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.author?.reference).toEqual(author);
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
    const author = 'Practitioner/' + randomUUID();

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
          reference: author
        }
      }
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.author?.reference).toEqual(author);
  });

  test('Create Patient as Practitioner with no author', async () => {
    const author = 'Practitioner/' + randomUUID();

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
    const author = 'Practitioner/' + randomUUID();
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

  test('Create resource with lastUpdated', async () => {
    const lastUpdated = '2020-01-01T12:00:00Z';

    // System repo has the ability to write custom timestamps
    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        lastUpdated
      }
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.lastUpdated).toEqual(lastUpdated);
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

  test('Search for Communications by ServiceRequest', async () => {
    const [outcome1, patient1] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }]
    });

    expect(outcome1.id).toEqual('created');
    expect(patient1).not.toBeUndefined();

    const [outcome2, serviceRequest1] = await repo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      code: {
        text: 'text'
      },
      subject: createReference(patient1 as Patient)
    });

    expect(outcome2.id).toEqual('created');
    expect(serviceRequest1).not.toBeUndefined();

    const [outcome3, comm1] = await repo.createResource<Communication>({
      resourceType: 'Communication',
      basedOn: [createReference(serviceRequest1 as ServiceRequest)],
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

    const [outcome5, serviceRequest2] = await repo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      code: {
        text: 'test'
      },
      subject: createReference(patient2 as Patient)
    });

    expect(outcome5.id).toEqual('created');
    expect(serviceRequest2).not.toBeUndefined();

    const [outcome6, comm2] = await repo.createResource<Communication>({
      resourceType: 'Communication',
      basedOn: [createReference(serviceRequest2 as ServiceRequest)],
      subject: createReference(patient2 as Patient),
      sender: createReference(patient2 as Patient),
      payload: [{ contentString: 'This is another test' }]
    });

    expect(outcome6.id).toEqual('created');
    expect(comm2).not.toBeUndefined();

    const [searchOutcome, searchResult] = await repo.search({
      resourceType: 'Communication',
      filters: [{
        code: 'based-on',
        operator: Operator.EQUALS,
        value: getReferenceString(serviceRequest1 as ServiceRequest)
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
    expect(bundle).not.toBeUndefined();
  });

  test('Search sort by Patient.meta.lastUpdated', async () => {
    const [outcome, bundle] = await repo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'lastUpdated' }]
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).not.toBeUndefined();
  });

  test('Search sort by Patient.identifier', async () => {
    const [outcome, bundle] = await repo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'identifier' }]
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).not.toBeUndefined();
  });

  test('Search sort by Patient.name', async () => {
    const [outcome, bundle] = await repo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'name' }]
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).not.toBeUndefined();
  });

  test('Search sort by Patient.given', async () => {
    const [outcome, bundle] = await repo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'given' }]
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).not.toBeUndefined();
  });

  test('Search sort by Patient.address', async () => {
    const [outcome, bundle] = await repo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'address' }]
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).not.toBeUndefined();
  });

  test('Search sort by Patient.telecom', async () => {
    const [outcome, bundle] = await repo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'telecom' }]
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).not.toBeUndefined();
  });

  test('Search sort by Patient.email', async () => {
    const [outcome, bundle] = await repo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'email' }]
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).not.toBeUndefined();
  });

  test('Search sort by Patient.birthDate', async () => {
    const [outcome, bundle] = await repo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'birthdate' }]
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).not.toBeUndefined();
  });

  test('Filter and sort on same search parameter', async () => {
    const [createOutcome, createBundle] = await createBatch(repo, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [{
        resource: {
          resourceType: 'Patient',
          name: [{ given: ['Marge'], family: 'Simpson' }]
        }
      }, {
        resource: {
          resourceType: 'Patient',
          name: [{ given: ['Homer'], family: 'Simpson' }]
        }
      }]
    });

    expect(isOk(createOutcome)).toBe(true);
    expect(createBundle).not.toBeUndefined();

    const [searchOutcome, bundle] = await repo.search({
      resourceType: 'Patient',
      filters: [{ code: 'family', operator: Operator.EQUALS, value: 'Simpson' }],
      sortRules: [{ code: 'family' }]
    });

    expect(isOk(searchOutcome)).toBe(true);
    expect(bundle?.entry).not.toBeUndefined();
    expect(bundle?.entry?.length).toBeGreaterThanOrEqual(2);
  });

  test('Compartment permissions', async () => {
    const registration1: RegisterRequest = {
      firstName: randomUUID(),
      lastName: randomUUID(),
      projectName: randomUUID(),
      email: randomUUID() + '@example.com',
      password: randomUUID()
    };

    const result1 = await registerNew(registration1);
    expect(result1.profile).not.toBeUndefined();

    const [loginOutcome1, login1] = await tryLogin({
      authMethod: 'password',
      clientId: MEDPLUM_CLIENT_APPLICATION_ID,
      email: registration1.email,
      password: registration1.password,
      scope: 'openid',
      role: 'practitioner',
      nonce: randomUUID(),
      remember: true
    });

    assertOk(loginOutcome1);
    expect(login1).not.toBeUndefined();

    const repo1 = await getRepoForLogin(login1 as Login);
    const [patientOutcome1, patient1] = await repo1.createResource<Patient>({
      resourceType: 'Patient'
    });

    assertOk(patientOutcome1);
    expect(patient1).not.toBeUndefined();
    expect(patient1?.id).not.toBeUndefined();

    const [patientOutcome2, patient2] = await repo1.readResource('Patient', patient1?.id as string);
    assertOk(patientOutcome2);
    expect(patient2).not.toBeUndefined();
    expect(patient2?.id).toEqual(patient1?.id);

    const registration2: RegisterRequest = {
      firstName: randomUUID(),
      lastName: randomUUID(),
      projectName: randomUUID(),
      email: randomUUID() + '@example.com',
      password: randomUUID()
    };

    const result2 = await registerNew(registration2);
    expect(result2.profile).not.toBeUndefined();

    const [loginOutcome2, login2] = await tryLogin({
      authMethod: 'password',
      clientId: MEDPLUM_CLIENT_APPLICATION_ID,
      email: registration2.email,
      password: registration2.password,
      scope: 'openid',
      role: 'practitioner',
      nonce: randomUUID(),
      remember: true
    });

    assertOk(loginOutcome2);
    expect(login2).not.toBeUndefined();

    const repo2 = await getRepoForLogin(login2 as Login);
    const [patientOutcome3, patient3] = await repo2.readResource('Patient', patient1?.id as string);
    expect(patientOutcome3.id).toEqual('not-found');
    expect(patient3).toBeUndefined();
  });

  test('Access policy restricting read', async () => {
    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01'
    });
    assertOk(createOutcome);
    expect(patient).not.toBeUndefined();

    // Empty access policy effectively blocks all reads and writes
    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy'
    };

    const repo2 = new Repository({
      project: MEDPLUM_PROJECT_ID,
      author: {
        reference: 'Practitioner/123'
      },
      accessPolicy
    });

    const [readOutcome] = await repo2.readResource('Patient', patient?.id as string);
    expect(readOutcome.id).toEqual('access-denied');
  });

  test('Access policy restricting search', async () => {
    // Empty access policy effectively blocks all reads and writes
    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy'
    };

    const repo2 = new Repository({
      project: MEDPLUM_PROJECT_ID,
      author: {
        reference: 'Practitioner/123'
      },
      accessPolicy
    });

    const [searchOutcome] = await repo2.search({ resourceType: 'Patient' });
    expect(searchOutcome.id).toEqual('access-denied');
  });

  test('Access policy allows public resources', async () => {
    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy'
    };

    const repo2 = new Repository({
      project: MEDPLUM_PROJECT_ID,
      author: {
        reference: 'Practitioner/123'
      },
      accessPolicy
    });

    const [searchOutcome] = await repo2.search({ resourceType: 'StructureDefinition' });
    expect(searchOutcome.id).toEqual('ok');
  });

  test('Access policy restricting write', async () => {
    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01'
    });
    assertOk(createOutcome);
    expect(patient).not.toBeUndefined();

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{
        resourceType: 'Patient',
        readonly: true
      }]
    };

    const repo2 = new Repository({
      project: MEDPLUM_PROJECT_ID,
      author: {
        reference: 'Practitioner/123'
      },
      accessPolicy
    });

    const [readOutcome] = await repo2.readResource('Patient', patient?.id as string);
    assertOk(readOutcome);

    const [writeOutcome] = await repo2.updateResource(patient as Patient);
    expect(writeOutcome.id).toEqual('access-denied');
  });

  test('Access policy restricting delete', async () => {
    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01'
    });
    assertOk(createOutcome);
    expect(patient).not.toBeUndefined();

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [{
        resourceType: 'Patient',
        readonly: true
      }]
    };

    const repo2 = new Repository({
      project: MEDPLUM_PROJECT_ID,
      author: {
        reference: 'Practitioner/123'
      },
      accessPolicy
    });

    const [readOutcome] = await repo2.readResource('Patient', patient?.id as string);
    assertOk(readOutcome);

    const [deleteOutcome] = await repo2.deleteResource('Patient', patient?.id as string);
    expect(deleteOutcome.id).toEqual('access-denied');
  });

  test('Access policy set compartment', async () => {
    const orgId = randomUUID();

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      compartment: {
        reference: 'Organization/' + orgId
      },
      resource: [{
        resourceType: 'Patient',
        compartment: {
          reference: 'Organization/' + orgId
        }
      }]
    };

    const repo = new Repository({
      project: MEDPLUM_PROJECT_ID,
      author: {
        reference: 'Practitioner/123'
      },
      accessPolicy
    });

    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01'
    });
    assertOk(createOutcome);
    expect(patient).not.toBeUndefined();
    expect(patient?.meta?.account).not.toBeUndefined();

    const [readOutcome, readPatient] = await repo.readResource('Patient', patient?.id as string);
    assertOk(readOutcome);
    expect(readPatient).not.toBeUndefined();
    expect(readPatient?.meta?.account).not.toBeUndefined();
  });

  test('Access policy restrict compartment', async () => {
    const org1 = randomUUID();
    const org2 = randomUUID();

    const accessPolicy1: AccessPolicy = {
      resourceType: 'AccessPolicy',
      compartment: {
        reference: 'Organization/' + org1
      },
      resource: [{
        resourceType: 'Patient',
        compartment: {
          reference: 'Organization/' + org1
        }
      }]
    };

    const accessPolicy2: AccessPolicy = {
      resourceType: 'AccessPolicy',
      compartment: {
        reference: 'Organization/' + org2
      },
      resource: [{
        resourceType: 'Patient',
        compartment: {
          reference: 'Organization/' + org2
        }
      }]
    };

    const repo1 = new Repository({
      project: MEDPLUM_PROJECT_ID,
      author: {
        reference: 'Practitioner/123'
      },
      accessPolicy: accessPolicy1
    });

    const repo2 = new Repository({
      project: MEDPLUM_PROJECT_ID,
      author: {
        reference: 'Practitioner/123'
      },
      accessPolicy: accessPolicy2
    });

    const [createOutcome1, patient1] = await repo1.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01'
    });
    assertOk(createOutcome1);
    expect(patient1).not.toBeUndefined();
    expect(patient1?.meta?.account).not.toBeUndefined();
    expect(patient1?.meta?.account?.reference).toEqual('Organization/' + org1);

    const [readOutcome1, readPatient1] = await repo1.readResource('Patient', patient1?.id as string);
    assertOk(readOutcome1);
    expect(readPatient1).not.toBeUndefined();
    expect(readPatient1?.meta?.account).not.toBeUndefined();

    const [createOutcome2, patient2] = await repo2.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01'
    });
    assertOk(createOutcome2);
    expect(patient2).not.toBeUndefined();
    expect(patient2?.meta?.account).not.toBeUndefined();
    expect(patient2?.meta?.account?.reference).toEqual('Organization/' + org2);

    const [readOutcome2, readPatient2] = await repo2.readResource('Patient', patient2?.id as string);
    assertOk(readOutcome2);
    expect(readPatient2).not.toBeUndefined();
    expect(readPatient2?.meta?.account).not.toBeUndefined();

    // Try to read patient1 with repo2
    // This should fail
    const [readOutcome3, readPatient3] = await repo2.readResource('Patient', patient1?.id as string);
    expect(readOutcome3.id).toEqual('not-found');
    expect(readPatient3).toBeUndefined();

    // Try to read patient2 with repo1
    // This should fail
    const [readOutcome4, readPatient4] = await repo1.readResource('Patient', patient2?.id as string);
    expect(readOutcome4.id).toEqual('not-found');
    expect(readPatient4).toBeUndefined();
  });

  test('ClientApplication with account restriction', async () => {
    const project = randomUUID();
    const account = 'Organization/' + randomUUID();

    // Create a ClientApplication with an account value
    const [outcome1, clientApplication] = await repo.createResource<ClientApplication>({
      resourceType: 'ClientApplication',
      secret: 'foo',
      redirectUri: 'https://example.com/',
      meta: {
        account: {
          reference: account
        }
      }
    });
    assertOk(outcome1);
    expect(clientApplication).not.toBeUndefined();

    // Create a repo for the ClientApplication
    // Use getRepoForLogin to generate the synthetic access policy
    const clientRepo = await getRepoForLogin({
      resourceType: 'Login',
      project: {
        reference: 'Project/' + project
      },
      profile: createReference(clientApplication as ClientApplication)
    });

    // Create a Patient using the ClientApplication
    const [outcome2, patient] = await clientRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Al'], family: 'Bundy' }],
      birthDate: '1975-12-12'
    });
    assertOk(outcome2);
    expect(patient).not.toBeUndefined();

    // The Patient should have the account value set
    expect(patient?.meta?.account?.reference).toEqual(account);

    // Create an Observation using the ClientApplication
    const [outcome3, observation] = await clientRepo.createResource<Observation>({
      resourceType: 'Observation',
      subject: createReference(patient as Patient),
      code: {
        text: 'test'
      },
      valueString: 'positive'
    });
    assertOk(outcome3);
    expect(observation).not.toBeUndefined();

    // The Observation should have the account value set
    expect(observation?.meta?.account?.reference).toEqual(account);

    // Create a Patient outside of the account
    const [outcome4, patient2] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Peggy'], family: 'Bundy' }],
      birthDate: '1975-11-11'
    });
    assertOk(outcome4);
    expect(patient2).not.toBeUndefined();

    // The ClientApplication should not be able to access it
    const [outcome5] = await clientRepo.readResource<Patient>('Patient', patient2?.id as string);
    expect(outcome5.id).toEqual('not-found');

    // Create an Observation outside of the account
    const [outcome6, observation2] = await repo.createResource<Observation>({
      resourceType: 'Observation',
      subject: createReference(patient2 as Patient),
      code: {
        text: 'test'
      },
      valueString: 'positive'
    });
    assertOk(outcome6);
    expect(observation2).not.toBeUndefined();

    // The ClientApplication should not be able to access it
    const [outcome7] = await clientRepo.readResource<Observation>('Observation', observation2?.id as string);
    expect(outcome7.id).toEqual('not-found');
  });

  test('Search birthDate after delete', async () => {
    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1971-02-02'
    });

    expect(createOutcome.id).toEqual('created');

    const [searchOutcome1, searchResult1] = await repo.search({
      resourceType: 'Patient',
      filters: [{
        code: 'birthdate',
        operator: Operator.EQUALS,
        value: '1971-02-02'
      }]
    });

    expect(searchOutcome1.id).toEqual('ok');
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

    const [deleteOutcome] = await repo.deleteResource('Patient', patient?.id as string);
    expect(deleteOutcome.id).toEqual('ok');

    const [searchOutcome2, searchResult2] = await repo.search({
      resourceType: 'Patient',
      filters: [{
        code: 'birthdate',
        operator: Operator.EQUALS,
        value: '1971-02-02'
      }]
    });

    expect(searchOutcome2.id).toEqual('ok');
    expect(searchResult2?.entry?.length).toEqual(0);
  });

  test('Search identifier after delete', async () => {
    const identifier = randomUUID();

    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }]
    });

    expect(createOutcome.id).toEqual('created');

    const [searchOutcome1, searchResult1] = await repo.search({
      resourceType: 'Patient',
      filters: [{
        code: 'identifier',
        operator: Operator.EQUALS,
        value: identifier
      }]
    });

    expect(searchOutcome1.id).toEqual('ok');
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

    const [deleteOutcome] = await repo.deleteResource('Patient', patient?.id as string);
    expect(deleteOutcome.id).toEqual('ok');

    const [searchOutcome2, searchResult2] = await repo.search({
      resourceType: 'Patient',
      filters: [{
        code: 'identifier',
        operator: Operator.EQUALS,
        value: identifier
      }]
    });

    expect(searchOutcome2.id).toEqual('ok');
    expect(searchResult2?.entry?.length).toEqual(0);
  });

});
