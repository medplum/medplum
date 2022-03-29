import { assertOk, createReference, getReferenceString, isOk, Operator } from '@medplum/core';
import {
  AuditEvent,
  Bundle,
  Communication,
  Encounter,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
  Resource,
  SearchParameter,
  ServiceRequest,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { registerNew, RegisterRequest } from '../auth/register';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { seedDatabase } from '../seed';
import { processBatch } from './batch';
import { getRepoForLogin, Repository, systemRepo } from './repo';
import { parseSearchRequest } from './search';

describe('FHIR Repo', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('getRepoForLogin', async () => {
    await expect(() =>
      getRepoForLogin({ resourceType: 'Login' }, { resourceType: 'ProjectMembership' })
    ).rejects.toEqual('Cannot create repo for login without profile');
  });

  test('Read resource with undefined id', async () => {
    const [outcome] = await systemRepo.readResource('Patient', undefined as unknown as string);
    expect(isOk(outcome)).toBe(false);
  });

  test('Read resource with blank id', async () => {
    const [outcome] = await systemRepo.readResource('Patient', '');
    expect(isOk(outcome)).toBe(false);
  });

  test('Read resource with invalid id', async () => {
    const [outcome] = await systemRepo.readResource('Patient', 'x');
    expect(isOk(outcome)).toBe(false);
  });

  test('Search total', async () => {
    const [outcome1, result1] = await systemRepo.search({
      resourceType: 'Patient',
    });
    assertOk(outcome1, result1);
    expect(result1.total).toBeUndefined();

    const [outcome2, result2] = await systemRepo.search({
      resourceType: 'Patient',
      total: 'none',
    });
    assertOk(outcome2, result2);
    expect(result2.total).toBeUndefined();

    const [outcome3, result3] = await systemRepo.search({
      resourceType: 'Patient',
      total: 'accurate',
    });
    assertOk(outcome3, result3);
    expect(result3.total).toBeDefined();

    const [outcome4, result4] = await systemRepo.search({
      resourceType: 'Patient',
      total: 'estimate',
    });
    assertOk(outcome4, result4);
    expect(result4.total).toBeDefined();
  });

  test('Repo read malformed reference', async () => {
    const [outcome1, resource1] = await systemRepo.readReference({
      reference: undefined,
    });
    expect(outcome1.id).not.toBe('ok');
    expect(resource1).toBeUndefined();

    const [outcome2, resource2] = await systemRepo.readReference({ reference: '' });
    expect(outcome2.id).not.toBe('ok');
    expect(resource2).toBeUndefined();

    const [outcome3, resource3] = await systemRepo.readReference({
      reference: '////',
    });
    expect(outcome3.id).not.toBe('ok');
    expect(resource3).toBeUndefined();

    const [outcome4, resource4] = await systemRepo.readReference({
      reference: 'Patient/123/foo',
    });
    expect(outcome4.id).not.toBe('ok');
    expect(resource4).toBeUndefined();
  });

  test('Read history', async () => {
    const [outcome1, version1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: {
        lastUpdated: new Date(Date.now() - 1000 * 60).toISOString(),
      },
    });
    expect(isOk(outcome1)).toBe(true);
    expect(version1).toBeDefined();
    expect(version1?.id).toBeDefined();

    const [outcome2, version2] = await systemRepo.updateResource<Patient>({
      resourceType: 'Patient',
      id: version1?.id,
      active: true,
      meta: {
        lastUpdated: new Date().toISOString(),
      },
    });
    expect(isOk(outcome2)).toBe(true);
    expect(version2).toBeDefined();
    expect(version2?.id).toEqual(version1?.id);
    expect(version2?.meta?.versionId).not.toEqual(version1?.meta?.versionId);

    const [outcome3, history] = await systemRepo.readHistory('Patient', version1?.id as string);
    expect(isOk(outcome3)).toBe(true);
    expect(history).toBeDefined();
    expect(history?.entry?.length).toBe(2);
    expect(history?.entry?.[0]?.resource?.id).toBe(version2?.id);
    expect(history?.entry?.[1]?.resource?.id).toBe(version1?.id);
  });

  test('Update patient', async () => {
    const [createOutcome, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Update1'], family: 'Update1' }],
    });

    expect(createOutcome.id).toEqual('created');

    const [updateOutcome, patient2] = await systemRepo.updateResource<Patient>({
      ...(patient1 as Patient),
      active: true,
    });

    expect(updateOutcome.id).toEqual('ok');
    expect(patient2?.id).toEqual(patient1?.id);
    expect(patient2?.meta?.versionId).not.toEqual(patient1?.meta?.versionId);
  });

  test('Update patient no changes', async () => {
    const [createOutcome, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Update1'], family: 'Update1' }],
    });

    expect(createOutcome.id).toEqual('created');

    const [updateOutcome, patient2] = await systemRepo.updateResource<Patient>({
      ...(patient1 as Patient),
    });

    expect(updateOutcome.id).toEqual('not-modified');
    expect(patient2?.id).toEqual(patient1?.id);
    expect(patient2?.meta?.versionId).toEqual(patient1?.meta?.versionId);
  });

  test('Update patient multiple names', async () => {
    const [createOutcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Suzy'], family: 'Smith' }],
    });

    expect(createOutcome1.id).toEqual('created');

    const [updateOutcome2, patient2] = await systemRepo.updateResource<Patient>({
      ...(patient1 as Patient),
      name: [
        { given: ['Suzy'], family: 'Smith' },
        { given: ['Suzy'], family: 'Jones' },
      ],
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
      project: randomUUID(),
      author: {
        reference: author,
      },
    });

    // Try to "update" a resource, which does not exist.
    // Some FHIR systems allow users to set ID's.
    // We do not.
    const [createOutcome, patient] = await repo.updateResource<Patient>({
      resourceType: 'Patient',
      id: randomUUID(),
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(createOutcome.id).toEqual('not-found');
    expect(patient).toBeUndefined();
  });

  test('Create Patient with no author', async () => {
    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.author?.reference).toEqual('system');
  });

  test('Create Patient as system on behalf of author', async () => {
    const author = 'Practitioner/' + randomUUID();
    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        author: {
          reference: author,
        },
      },
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.author?.reference).toEqual(author);
  });

  test('Create Patient as ClientApplication with no author', async () => {
    const clientApp = 'ClientApplication/' + randomUUID();

    const repo = new Repository({
      author: {
        reference: clientApp,
      },
    });

    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.author?.reference).toEqual(clientApp);
  });

  test('Create Patient as Practitioner with no author', async () => {
    const author = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      author: {
        reference: author,
      },
    });

    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.author?.reference).toEqual(author);
  });

  test('Create Patient as Practitioner on behalf of author', async () => {
    const author = 'Practitioner/' + randomUUID();
    const fakeAuthor = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      author: {
        reference: author,
      },
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
          reference: fakeAuthor,
        },
      },
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.author?.reference).toEqual(author);
  });

  test('Create resource with account', async () => {
    const author = 'Practitioner/' + randomUUID();
    const account = 'Organization/' + randomUUID();

    // This user does not have an access policy
    // So they can optionally set an account
    const repo = new Repository({
      author: {
        reference: author,
      },
    });

    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        account: {
          reference: account,
        },
      },
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.author?.reference).toEqual(author);
    expect(patient?.meta?.account?.reference).toEqual(account);
  });

  test('Create resource with lastUpdated', async () => {
    const lastUpdated = '2020-01-01T12:00:00Z';

    // System systemRepo has the ability to write custom timestamps
    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        lastUpdated,
      },
    });

    expect(createOutcome.id).toEqual('created');
    expect(patient?.meta?.lastUpdated).toEqual(lastUpdated);
  });

  test('Update resource with lastUpdated', async () => {
    const lastUpdated = '2020-01-01T12:00:00Z';

    // System systemRepo has the ability to write custom timestamps
    const [createOutcome, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        lastUpdated,
      },
    });
    expect(createOutcome.id).toEqual('created');
    expect(patient1?.meta?.lastUpdated).toEqual(lastUpdated);

    // But system cannot update the timestamp
    const [updateOutcome, patient2] = await systemRepo.updateResource<Patient>({
      ...(patient1 as Patient),
      active: true,
      meta: {
        lastUpdated,
      },
    });
    expect(updateOutcome.id).toEqual('ok');
    expect(patient2?.meta?.lastUpdated).not.toEqual(lastUpdated);
  });

  test('Search for Communications by Encounter', async () => {
    const [outcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(outcome1.id).toEqual('created');
    expect(patient1).toBeDefined();

    const [outcome2, encounter1] = await systemRepo.createResource<Encounter>({
      resourceType: 'Encounter',
      class: {
        code: 'HH',
        display: 'home health',
      },
      subject: createReference(patient1 as Patient),
    });

    expect(outcome2.id).toEqual('created');
    expect(encounter1).toBeDefined();

    const [outcome3, comm1] = await systemRepo.createResource<Communication>({
      resourceType: 'Communication',
      encounter: createReference(encounter1 as Encounter),
      subject: createReference(patient1 as Patient),
      sender: createReference(patient1 as Patient),
      payload: [{ contentString: 'This is a test' }],
    });

    expect(outcome3.id).toEqual('created');
    expect(comm1).toBeDefined();

    const [outcome4, patient2] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Jones' }],
    });

    expect(outcome4.id).toEqual('created');
    expect(patient2).toBeDefined();

    const [outcome5, encounter2] = await systemRepo.createResource<Encounter>({
      resourceType: 'Encounter',
      class: {
        code: 'HH',
        display: 'home health',
      },
      subject: createReference(patient2 as Patient),
    });

    expect(outcome5.id).toEqual('created');
    expect(encounter2).toBeDefined();

    const [outcome6, comm2] = await systemRepo.createResource<Communication>({
      resourceType: 'Communication',
      encounter: createReference(encounter2 as Encounter),
      subject: createReference(patient2 as Patient),
      sender: createReference(patient2 as Patient),
      payload: [{ contentString: 'This is another test' }],
    });

    expect(outcome6.id).toEqual('created');
    expect(comm2).toBeDefined();

    const [searchOutcome, searchResult] = await systemRepo.search({
      resourceType: 'Communication',
      filters: [
        {
          code: 'encounter',
          operator: Operator.EQUALS,
          value: getReferenceString(encounter1 as Encounter),
        },
      ],
    });

    expect(searchOutcome.id).toEqual('ok');
    expect(searchResult?.entry?.length).toEqual(1);
    expect(searchResult?.entry?.[0]?.resource?.id).toEqual(comm1?.id);
  });

  test('Search for Communications by ServiceRequest', async () => {
    const [outcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(outcome1.id).toEqual('created');
    expect(patient1).toBeDefined();

    const [outcome2, serviceRequest1] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      code: {
        text: 'text',
      },
      subject: createReference(patient1 as Patient),
    });

    expect(outcome2.id).toEqual('created');
    expect(serviceRequest1).toBeDefined();

    const [outcome3, comm1] = await systemRepo.createResource<Communication>({
      resourceType: 'Communication',
      basedOn: [createReference(serviceRequest1 as ServiceRequest)],
      subject: createReference(patient1 as Patient),
      sender: createReference(patient1 as Patient),
      payload: [{ contentString: 'This is a test' }],
    });

    expect(outcome3.id).toEqual('created');
    expect(comm1).toBeDefined();

    const [outcome4, patient2] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Jones' }],
    });

    expect(outcome4.id).toEqual('created');
    expect(patient2).toBeDefined();

    const [outcome5, serviceRequest2] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      code: {
        text: 'test',
      },
      subject: createReference(patient2 as Patient),
    });

    expect(outcome5.id).toEqual('created');
    expect(serviceRequest2).toBeDefined();

    const [outcome6, comm2] = await systemRepo.createResource<Communication>({
      resourceType: 'Communication',
      basedOn: [createReference(serviceRequest2 as ServiceRequest)],
      subject: createReference(patient2 as Patient),
      sender: createReference(patient2 as Patient),
      payload: [{ contentString: 'This is another test' }],
    });

    expect(outcome6.id).toEqual('created');
    expect(comm2).toBeDefined();

    const [searchOutcome, searchResult] = await systemRepo.search({
      resourceType: 'Communication',
      filters: [
        {
          code: 'based-on',
          operator: Operator.EQUALS,
          value: getReferenceString(serviceRequest1 as ServiceRequest),
        },
      ],
    });

    expect(searchOutcome.id).toEqual('ok');
    expect(searchResult?.entry?.length).toEqual(1);
    expect(searchResult?.entry?.[0]?.resource?.id).toEqual(comm1?.id);
  });

  test('Search for QuestionnaireResponse by Questionnaire', async () => {
    const [outcome1, questionnaire] = await systemRepo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
    });
    assertOk(outcome1, questionnaire);

    const [outcome2, response1] = await systemRepo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      questionnaire: getReferenceString(questionnaire),
    });
    assertOk(outcome2, response1);

    const [outcome3, response2] = await systemRepo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      questionnaire: `Questionnaire/${randomUUID()}`,
    });
    assertOk(outcome3, response2);

    const [outcome4, bundle] = await systemRepo.search({
      resourceType: 'QuestionnaireResponse',
      filters: [
        {
          code: 'questionnaire',
          operator: Operator.EQUALS,
          value: getReferenceString(questionnaire),
        },
      ],
    });
    assertOk(outcome4, bundle);
    expect(bundle.entry?.length).toEqual(1);
    expect(bundle.entry?.[0]?.resource?.id).toEqual(response1.id);
  });

  test('Search for token in array', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'SearchParameter',
      filters: [
        {
          code: 'base',
          operator: Operator.EQUALS,
          value: 'Patient',
        },
      ],
      count: 100,
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle?.entry?.find((e) => (e.resource as SearchParameter).code === 'name')).toBeDefined();
    expect(bundle?.entry?.find((e) => (e.resource as SearchParameter).code === 'email')).toBeDefined();
  });

  test('Search sort by Patient.id', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'id' }],
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.meta.lastUpdated', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'lastUpdated' }],
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.identifier', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'identifier' }],
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.name', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'name' }],
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.given', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'given' }],
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.address', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'address' }],
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.telecom', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'telecom' }],
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.email', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'email' }],
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.birthDate', async () => {
    const [outcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'birthdate' }],
    });

    expect(outcome.id).toEqual('ok');
    expect(bundle).toBeDefined();
  });

  test('Filter and sort on same search parameter', async () => {
    const [createOutcome, createBundle] = await processBatch(systemRepo, {
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
            name: [{ given: ['Marge'], family: 'Simpson' }],
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            name: [{ given: ['Homer'], family: 'Simpson' }],
          },
        },
      ],
    });

    expect(isOk(createOutcome)).toBe(true);
    expect(createBundle).toBeDefined();

    const [searchOutcome, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [{ code: 'family', operator: Operator.EQUALS, value: 'Simpson' }],
      sortRules: [{ code: 'family' }],
    });

    expect(isOk(searchOutcome)).toBe(true);
    expect(bundle?.entry).toBeDefined();
    expect(bundle?.entry?.length).toBeGreaterThanOrEqual(2);
  });

  test('Compartment permissions', async () => {
    const registration1: RegisterRequest = {
      firstName: randomUUID(),
      lastName: randomUUID(),
      projectName: randomUUID(),
      email: randomUUID() + '@example.com',
      password: randomUUID(),
    };

    const result1 = await registerNew(registration1);
    expect(result1.profile).toBeDefined();

    const repo1 = await getRepoForLogin({ resourceType: 'Login' }, result1.membership);
    const [patientOutcome1, patient1] = await repo1.createResource<Patient>({
      resourceType: 'Patient',
    });

    assertOk(patientOutcome1, patient1);
    expect(patient1).toBeDefined();
    expect(patient1?.id).toBeDefined();

    const [patientOutcome2, patient2] = await repo1.readResource('Patient', patient1?.id as string);
    assertOk(patientOutcome2, patient2);
    expect(patient2).toBeDefined();
    expect(patient2?.id).toEqual(patient1?.id);

    const registration2: RegisterRequest = {
      firstName: randomUUID(),
      lastName: randomUUID(),
      projectName: randomUUID(),
      email: randomUUID() + '@example.com',
      password: randomUUID(),
    };

    const result2 = await registerNew(registration2);
    expect(result2.profile).toBeDefined();

    const repo2 = await getRepoForLogin({ resourceType: 'Login' }, result2.membership);
    const [patientOutcome3, patient3] = await repo2.readResource('Patient', patient1?.id as string);
    expect(patientOutcome3.id).toEqual('not-found');
    expect(patient3).toBeUndefined();
  });

  test('Search birthDate after delete', async () => {
    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1971-02-02',
    });

    expect(createOutcome.id).toEqual('created');

    const [searchOutcome1, searchResult1] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'birthdate',
          operator: Operator.EQUALS,
          value: '1971-02-02',
        },
      ],
    });

    expect(searchOutcome1.id).toEqual('ok');
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

    const [deleteOutcome] = await systemRepo.deleteResource('Patient', patient?.id as string);
    expect(deleteOutcome.id).toEqual('ok');

    const [searchOutcome2, searchResult2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'birthdate',
          operator: Operator.EQUALS,
          value: '1971-02-02',
        },
      ],
    });

    expect(searchOutcome2.id).toEqual('ok');
    expect(searchResult2?.entry?.length).toEqual(0);
  });

  test('Search identifier after delete', async () => {
    const identifier = randomUUID();

    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });

    expect(createOutcome.id).toEqual('created');

    const [searchOutcome1, searchResult1] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });

    expect(searchOutcome1.id).toEqual('ok');
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

    const [deleteOutcome] = await systemRepo.deleteResource('Patient', patient?.id as string);
    expect(deleteOutcome.id).toEqual('ok');

    const [searchOutcome2, searchResult2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });

    expect(searchOutcome2.id).toEqual('ok');
    expect(searchResult2?.entry?.length).toEqual(0);
  });

  test('String filter', async () => {
    const [outcome1, bundle1] = await systemRepo.search({
      resourceType: 'StructureDefinition',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Questionnaire',
        },
      ],
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
      ],
    });
    assertOk(outcome1, bundle1);
    expect(bundle1?.entry?.length).toEqual(2);
    expect((bundle1?.entry?.[0]?.resource as StructureDefinition).name).toEqual('Questionnaire');
    expect((bundle1?.entry?.[1]?.resource as StructureDefinition).name).toEqual('QuestionnaireResponse');

    const [outcome2, bundle2] = await systemRepo.search({
      resourceType: 'StructureDefinition',
      filters: [
        {
          code: 'name',
          operator: Operator.EXACT,
          value: 'Questionnaire',
        },
      ],
    });
    assertOk(outcome2, bundle2);
    expect(bundle2?.entry?.length).toEqual(1);
    expect((bundle2?.entry?.[0]?.resource as StructureDefinition).name).toEqual('Questionnaire');
  });

  test('Filter by _id', async () => {
    // Unique family name to isolate the test
    const family = randomUUID();

    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family }],
    });
    assertOk(createOutcome, patient);
    expect(patient).toBeDefined();

    const [searchOutcome1, searchResult1] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: '_id',
          operator: Operator.EQUALS,
          value: patient?.id as string,
        },
      ],
    });

    expect(searchOutcome1.id).toEqual('ok');
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(bundleContains(searchResult1 as Bundle, patient as Patient)).toEqual(true);

    const [searchOutcome2, searchResult2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: family,
        },
        {
          code: '_id',
          operator: Operator.NOT_EQUALS,
          value: patient?.id as string,
        },
      ],
    });

    expect(searchOutcome2.id).toEqual('ok');
    expect(searchResult2?.entry?.length).toEqual(0);
  });

  test('Filter by _project', async () => {
    const project1 = randomUUID();
    const project2 = randomUUID();

    const [outcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice1'], family: 'Smith1' }],
      meta: {
        project: project1,
      },
    });
    assertOk(outcome1, patient1);
    expect(patient1).toBeDefined();

    const [outcome2, patient2] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice2'], family: 'Smith2' }],
      meta: {
        project: project2,
      },
    });
    assertOk(outcome2, patient2);
    expect(patient2).toBeDefined();

    const [outcome3, bundle] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: '_project',
          operator: Operator.EQUALS,
          value: project1,
        },
      ],
    });
    assertOk(outcome3, bundle);
    expect(bundle?.entry?.length).toEqual(1);
    expect(bundleContains(bundle as Bundle, patient1 as Patient)).toEqual(true);
    expect(bundleContains(bundle as Bundle, patient2 as Patient)).toEqual(false);
  });

  test('Filter by _lastUpdated', async () => {
    // Create 2 patients
    // One with a _lastUpdated of 1 second ago
    // One with a _lastUpdated of 2 seconds ago
    const family = randomUUID();
    const now = new Date();
    const nowMinus1Second = new Date(now.getTime() - 1000);
    const nowMinus2Seconds = new Date(now.getTime() - 2000);
    const nowMinus3Seconds = new Date(now.getTime() - 3000);

    const [outcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family }],
      meta: {
        lastUpdated: nowMinus1Second.toISOString(),
      },
    });
    assertOk(outcome1, patient1);
    expect(patient1).toBeDefined();

    const [outcome2, patient2] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family }],
      meta: {
        lastUpdated: nowMinus2Seconds.toISOString(),
      },
    });
    assertOk(outcome2, patient2);
    expect(patient2).toBeDefined();

    // Greater than (newer than) 2 seconds ago should only return patient 1
    const [searchOutcome1, searchResult1] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: family,
        },
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN,
          value: nowMinus2Seconds.toISOString(),
        },
      ],
    });

    expect(searchOutcome1.id).toEqual('ok');
    expect(bundleContains(searchResult1 as Bundle, patient1 as Patient)).toEqual(true);
    expect(bundleContains(searchResult1 as Bundle, patient2 as Patient)).toEqual(false);

    // Greater than (newer than) or equal to 2 seconds ago should return both patients
    const [searchOutcome2, searchResult2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: family,
        },
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
          value: nowMinus2Seconds.toISOString(),
        },
      ],
    });

    expect(searchOutcome2.id).toEqual('ok');
    expect(bundleContains(searchResult2 as Bundle, patient1 as Patient)).toEqual(true);
    expect(bundleContains(searchResult2 as Bundle, patient2 as Patient)).toEqual(true);

    // Less than (older than) to 1 seconds ago should only return patient 2
    const [searchOutcome3, searchResult3] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: family,
        },
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN,
          value: nowMinus3Seconds.toISOString(),
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN,
          value: nowMinus1Second.toISOString(),
        },
      ],
    });

    expect(searchOutcome3.id).toEqual('ok');
    expect(bundleContains(searchResult3 as Bundle, patient1 as Patient)).toEqual(false);
    expect(bundleContains(searchResult3 as Bundle, patient2 as Patient)).toEqual(true);

    // Less than (older than) or equal to 1 seconds ago should return both patients
    const [searchOutcome4, searchResult4] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: family,
        },
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN,
          value: nowMinus3Seconds.toISOString(),
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN_OR_EQUALS,
          value: nowMinus1Second.toISOString(),
        },
      ],
    });

    expect(searchOutcome4.id).toEqual('ok');
    expect(bundleContains(searchResult4 as Bundle, patient1 as Patient)).toEqual(true);
    expect(bundleContains(searchResult4 as Bundle, patient2 as Patient)).toEqual(true);
  });

  test('Sort by _lastUpdated', async () => {
    const project = randomUUID();

    const [outcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice1'], family: 'Smith1' }],
      meta: {
        lastUpdated: '2020-01-01T00:00:00.000Z',
        project,
      },
    });
    assertOk(outcome1, patient1);
    expect(patient1).toBeDefined();

    const [outcome2, patient2] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice2'], family: 'Smith2' }],
      meta: {
        lastUpdated: '2020-01-02T00:00:00.000Z',
        project,
      },
    });
    assertOk(outcome2, patient2);
    expect(patient2).toBeDefined();

    const [outcome3, bundle3] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: '_project',
          operator: Operator.EQUALS,
          value: project,
        },
      ],
      sortRules: [
        {
          code: '_lastUpdated',
          descending: false,
        },
      ],
    });
    assertOk(outcome3, bundle3);
    expect(bundle3?.entry?.length).toEqual(2);
    expect(bundle3?.entry?.[0]?.resource?.id).toEqual(patient1?.id);
    expect(bundle3?.entry?.[1]?.resource?.id).toEqual(patient2?.id);

    const [outcome4, bundle4] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: '_project',
          operator: Operator.EQUALS,
          value: project,
        },
      ],
      sortRules: [
        {
          code: '_lastUpdated',
          descending: true,
        },
      ],
    });
    assertOk(outcome4, bundle4);
    expect(bundle4?.entry?.length).toEqual(2);
    expect(bundle4?.entry?.[0]?.resource?.id).toEqual(patient2?.id);
    expect(bundle4?.entry?.[1]?.resource?.id).toEqual(patient1?.id);
  });

  test('Unsupported date search param', async () => {
    const [outcome, resource] = await systemRepo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
      },
      period: {
        start: '2014-01-11T21:23:39-08:00',
        end: '2014-01-11T21:38:39-08:00',
      },
    });
    expect(outcome.id).toEqual('created');
    expect(resource).toBeDefined();
    expect(resource?.id).toBeDefined();
  });

  test('Filter by Coding', async () => {
    const auditEvents = [] as AuditEvent[];

    for (let i = 0; i < 3; i++) {
      const [outcome, resource] = await systemRepo.createResource<AuditEvent>({
        resourceType: 'AuditEvent',
        type: {
          code: randomUUID(),
        },
        agent: [],
        source: {},
      });
      assertOk(outcome, resource);
      auditEvents.push(resource);
    }

    for (let i = 0; i < 3; i++) {
      const [outcome, bundle] = await systemRepo.search({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'type',
            operator: Operator.CONTAINS,
            value: auditEvents[i].type?.code as string,
          },
        ],
      });
      assertOk(outcome, bundle);
      expect(bundle.entry?.length).toEqual(1);
      expect(bundle.entry?.[0]?.resource?.id).toEqual(auditEvents[i].id);
    }
  });

  test('Filter by CodeableConcept', async () => {
    const x1 = randomUUID();
    const x2 = randomUUID();
    const x3 = randomUUID();

    // Create test patient
    const [outcome0, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'CodeableConcept' }],
    });
    assertOk(outcome0, patient);

    // Use code.coding[0].code
    const [outcome1, serviceRequest1] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      subject: createReference(patient),
      code: {
        coding: [
          {
            code: x1,
          },
        ],
      },
    });
    assertOk(outcome1, serviceRequest1);

    // Use code.coding[0].display
    const [outcome2, serviceRequest2] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      subject: createReference(patient),
      code: {
        coding: [
          {
            display: x2,
          },
        ],
      },
    });
    assertOk(outcome2, serviceRequest2);

    // Use code.text
    const [outcome3, serviceRequest3] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      subject: createReference(patient),
      code: {
        text: x3,
      },
    });
    assertOk(outcome3, serviceRequest3);

    const [outcome4, bundle1] = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'code',
          operator: Operator.EQUALS,
          value: x1,
        },
      ],
    });
    assertOk(outcome4, bundle1);
    expect(bundle1.entry?.length).toEqual(1);
    expect(bundleContains(bundle1, serviceRequest1)).toEqual(true);
    expect(bundleContains(bundle1, serviceRequest2)).toEqual(false);
    expect(bundleContains(bundle1, serviceRequest3)).toEqual(false);

    const [outcome5, bundle2] = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'code',
          operator: Operator.EQUALS,
          value: x2,
        },
      ],
    });
    assertOk(outcome5, bundle2);
    expect(bundle2.entry?.length).toEqual(1);
    expect(bundleContains(bundle2, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle2, serviceRequest2)).toEqual(true);
    expect(bundleContains(bundle2, serviceRequest3)).toEqual(false);

    const [outcome6, bundle3] = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'code',
          operator: Operator.EQUALS,
          value: x3,
        },
      ],
    });
    assertOk(outcome6, bundle3);
    expect(bundle3.entry?.length).toEqual(1);
    expect(bundleContains(bundle3, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle3, serviceRequest2)).toEqual(false);
    expect(bundleContains(bundle3, serviceRequest3)).toEqual(true);
  });

  test('Reindex resource type as non-admin', async () => {
    const repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'Practitioner/' + randomUUID(),
      },
    });

    const [reindexOutcome] = await repo.reindexResourceType('Practitioner');
    expect(isOk(reindexOutcome)).toBe(false);
  });

  test('Reindex resource as non-admin', async () => {
    const repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'Practitioner/' + randomUUID(),
      },
    });

    const [reindexOutcome] = await repo.reindexResource('Practitioner', randomUUID());
    expect(isOk(reindexOutcome)).toBe(false);
  });

  test('Reindex resource not found', async () => {
    const [reindexOutcome] = await systemRepo.reindexResource('Practitioner', randomUUID());
    expect(isOk(reindexOutcome)).toBe(false);
  });

  test('Reindex success', async () => {
    const [reindexOutcome] = await systemRepo.reindexResourceType('Practitioner');
    expect(isOk(reindexOutcome)).toBe(true);
  });

  test('Remove property', async () => {
    const value = randomUUID();

    // Create a patient with an identifier
    const [outcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Identifier'], family: 'Test' }],
      identifier: [{ system: 'https://example.com/', value }],
    });
    assertOk(outcome1, patient1);

    // Search for patient by identifier
    // This should succeed
    const [outcome2, bundle1] = await systemRepo.search<Patient>({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value,
        },
      ],
    });
    assertOk(outcome2, bundle1);
    expect(bundle1.entry?.length).toEqual(1);

    const { identifier, ...rest } = patient1;
    expect(identifier).toBeDefined();
    expect((rest as Patient).identifier).toBeUndefined();

    const [outcome3, patient2] = await systemRepo.updateResource<Patient>(rest);
    assertOk(outcome3, patient2);
    expect(patient2.identifier).toBeUndefined();

    // Try to search for the identifier
    // This should return empty result
    const [outcome4, bundle2] = await systemRepo.search<Patient>({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value,
        },
      ],
    });
    assertOk(outcome4, bundle2);
    expect(bundle2.entry?.length).toEqual(0);
  });

  test('ServiceRequest.orderDetail search', async () => {
    const orderDetailText = randomUUID();
    const orderDetailCode = randomUUID();

    const [outcome1, serviceRequest] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      subject: {
        reference: 'Patient/' + randomUUID(),
      },
      code: {
        coding: [
          {
            code: 'order-type',
          },
        ],
      },
      orderDetail: [
        {
          text: orderDetailText,
          coding: [
            {
              system: 'custom-order-system',
              code: orderDetailCode,
            },
          ],
        },
      ],
    });
    assertOk(outcome1, serviceRequest);

    const [outcome2, bundle1] = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'order-detail',
          operator: Operator.CONTAINS,
          value: orderDetailText,
        },
      ],
    });
    assertOk(outcome2, bundle1);
    expect(bundle1.entry?.length).toEqual(1);
  });

  test('Token not equals', async () => {
    const category = randomUUID();
    const code1 = randomUUID();
    const code2 = randomUUID();

    const [outcome1, serviceRequest1] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/' + randomUUID() },
      category: [{ coding: [{ code: category }] }],
      code: { coding: [{ code: code1 }] },
    });
    assertOk(outcome1, serviceRequest1);

    const [outcome2, serviceRequest2] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/' + randomUUID() },
      category: [{ coding: [{ code: category }] }],
      code: { coding: [{ code: code2 }] },
    });
    assertOk(outcome2, serviceRequest2);

    const [outcome3, bundle1] = await systemRepo.search(
      parseSearchRequest('ServiceRequest', { category, 'code:not': code1 })
    );
    assertOk(outcome3, bundle1);
    expect(bundle1.entry?.length).toEqual(1);
    expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);
  });

  test('Token array not equals', async () => {
    const category1 = randomUUID();
    const category2 = randomUUID();
    const code = randomUUID();

    const [outcome1, serviceRequest1] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/' + randomUUID() },
      category: [{ coding: [{ code: category1 }] }],
      code: { coding: [{ code }] },
    });
    assertOk(outcome1, serviceRequest1);

    const [outcome2, serviceRequest2] = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/' + randomUUID() },
      category: [{ coding: [{ code: category2 }] }],
      code: { coding: [{ code }] },
    });
    assertOk(outcome2, serviceRequest2);

    const [outcome3, bundle1] = await systemRepo.search(
      parseSearchRequest('ServiceRequest', { code, 'category:not': category1 })
    );
    assertOk(outcome3, bundle1);
    expect(bundle1.entry?.length).toEqual(1);
    expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);
  });
});

function bundleContains(bundle: Bundle, resource: Resource): boolean {
  return !!bundle.entry?.some((entry) => entry.resource?.id === resource.id);
}
