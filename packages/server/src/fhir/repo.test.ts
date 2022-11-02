import { createReference, getReferenceString, isOk, normalizeErrorString, Operator } from '@medplum/core';
import {
  AllergyIntolerance,
  Appointment,
  AuditEvent,
  Bundle,
  BundleEntry,
  Communication,
  Encounter,
  Observation,
  OperationOutcome,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
  ResourceType,
  SearchParameter,
  ServiceRequest,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { registerNew, RegisterRequest } from '../auth/register';
import { loadTestConfig } from '../config';
import { bundleContains } from '../test.setup';
import { processBatch } from './batch';
import { getRepoForLogin, Repository, systemRepo } from './repo';
import { parseSearchRequest } from './search';

jest.mock('hibp');
jest.mock('ioredis');

describe('FHIR Repo', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('getRepoForLogin', async () => {
    await expect(() =>
      getRepoForLogin({ resourceType: 'Login' }, { resourceType: 'ProjectMembership' })
    ).rejects.toThrow('Invalid author reference');
  });

  test('Read resource with undefined id', async () => {
    try {
      await systemRepo.readResource('Patient', undefined as unknown as string);
      fail('Should have thrown');
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(isOk(outcome)).toBe(false);
    }
  });

  test('Read resource with blank id', async () => {
    try {
      await systemRepo.readResource('Patient', '');
      fail('Should have thrown');
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(isOk(outcome)).toBe(false);
    }
  });

  test('Read resource with invalid id', async () => {
    try {
      await systemRepo.readResource('Patient', 'x');
      fail('Should have thrown');
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(isOk(outcome)).toBe(false);
    }
  });

  test('Search total', async () => {
    const result1 = await systemRepo.search({
      resourceType: 'Patient',
    });
    expect(result1.total).toBeUndefined();
    expect(result1.link?.length).toBe(3);

    const result2 = await systemRepo.search({
      resourceType: 'Patient',
      total: 'none',
    });
    expect(result2.total).toBeUndefined();

    const result3 = await systemRepo.search({
      resourceType: 'Patient',
      total: 'accurate',
    });
    expect(result3.total).toBeDefined();
    expect(typeof result3.total).toBe('number');

    const result4 = await systemRepo.search({
      resourceType: 'Patient',
      total: 'estimate',
    });
    expect(result4.total).toBeDefined();
    expect(typeof result4.total).toBe('number');
  });

  test('Search count=0', async () => {
    const result1 = await systemRepo.search({
      resourceType: 'Patient',
      count: 0,
    });
    expect(result1.entry).toBeUndefined();
    expect(result1.link).toBeDefined();
    expect(result1.link?.length).toBe(1);
  });

  test('Search next link', async () => {
    const family = randomUUID();

    for (let i = 0; i < 2; i++) {
      await systemRepo.createResource({
        resourceType: 'Patient',
        name: [{ family }],
      });
    }

    const result1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: family }],
      count: 1,
    });
    expect(result1.entry).toHaveLength(1);
    expect(result1.link).toBeDefined();
    expect(result1.link?.find((e) => e.relation === 'next')).toBeDefined();

    const result2 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: family }],
      count: 2,
    });
    expect(result2.entry).toHaveLength(2);
    expect(result2.link).toBeDefined();
    expect(result2.link?.find((e) => e.relation === 'next')).toBeUndefined();

    const result3 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: family }],
      count: 3,
    });
    expect(result3.entry).toHaveLength(2);
    expect(result3.link).toBeDefined();
    expect(result3.link?.find((e) => e.relation === 'next')).toBeUndefined();
  });

  test('Repo read malformed reference', async () => {
    try {
      await systemRepo.readReference({ reference: undefined });
      fail('Should have thrown');
    } catch (err) {
      expect((err as OperationOutcome).id).not.toBe('ok');
    }

    try {
      await systemRepo.readReference({ reference: '' });
      fail('Should have thrown');
    } catch (err) {
      expect((err as OperationOutcome).id).not.toBe('ok');
    }

    try {
      await systemRepo.readReference({ reference: '////' });
      fail('Should have thrown');
    } catch (err) {
      expect((err as OperationOutcome).id).not.toBe('ok');
    }

    try {
      await systemRepo.readReference({ reference: 'Patient/123/foo' });
      fail('Should have thrown');
    } catch (err) {
      expect((err as OperationOutcome).id).not.toBe('ok');
    }
  });

  test('Read history', async () => {
    const version1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: {
        lastUpdated: new Date(Date.now() - 1000 * 60).toISOString(),
      },
    });
    expect(version1).toBeDefined();
    expect(version1?.id).toBeDefined();

    const version2 = await systemRepo.updateResource<Patient>({
      resourceType: 'Patient',
      id: version1?.id,
      active: true,
      meta: {
        lastUpdated: new Date().toISOString(),
      },
    });
    expect(version2).toBeDefined();
    expect(version2?.id).toEqual(version1?.id);
    expect(version2?.meta?.versionId).not.toEqual(version1?.meta?.versionId);

    const history = await systemRepo.readHistory('Patient', version1?.id as string);
    expect(history).toBeDefined();
    expect(history?.entry?.length).toBe(2);
    expect(history?.entry?.[0]?.resource?.id).toBe(version2?.id);
    expect(history?.entry?.[1]?.resource?.id).toBe(version1?.id);
  });

  test('Update patient', async () => {
    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Update1'], family: 'Update1' }],
    });

    const patient2 = await systemRepo.updateResource<Patient>({
      ...(patient1 as Patient),
      active: true,
    });

    expect(patient2?.id).toEqual(patient1?.id);
    expect(patient2?.meta?.versionId).not.toEqual(patient1?.meta?.versionId);
  });

  test('Update patient no changes', async () => {
    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Update1'], family: 'Update1' }],
    });

    const patient2 = await systemRepo.updateResource<Patient>({
      ...(patient1 as Patient),
    });

    expect(patient2?.id).toEqual(patient1?.id);
    expect(patient2?.meta?.versionId).toEqual(patient1?.meta?.versionId);
  });

  test('Update patient multiple names', async () => {
    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Suzy'], family: 'Smith' }],
    });

    const patient2 = await systemRepo.updateResource<Patient>({
      ...(patient1 as Patient),
      name: [
        { given: ['Suzy'], family: 'Smith' },
        { given: ['Suzy'], family: 'Jones' },
      ],
    });

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
      extendedMode: true,
      author: {
        reference: author,
      },
    });

    // Try to "update" a resource, which does not exist.
    // Some FHIR systems allow users to set ID's.
    // We do not.
    try {
      await repo.updateResource<Patient>({
        resourceType: 'Patient',
        id: randomUUID(),
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(outcome.id).toEqual('not-found');
    }
  });

  test('Create Patient with no author', async () => {
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patient?.meta?.author?.reference).toEqual('system');
  });

  test('Create Patient as system on behalf of author', async () => {
    const author = 'Practitioner/' + randomUUID();
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        author: {
          reference: author,
        },
      },
    });

    expect(patient?.meta?.author?.reference).toEqual(author);
  });

  test('Create Patient as ClientApplication with no author', async () => {
    const clientApp = 'ClientApplication/' + randomUUID();

    const repo = new Repository({
      extendedMode: true,
      author: {
        reference: clientApp,
      },
    });

    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patient?.meta?.author?.reference).toEqual(clientApp);
  });

  test('Create Patient as Practitioner with no author', async () => {
    const author = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      extendedMode: true,
      author: {
        reference: author,
      },
    });

    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patient?.meta?.author?.reference).toEqual(author);
  });

  test('Create Patient as Practitioner on behalf of author', async () => {
    const author = 'Practitioner/' + randomUUID();
    const fakeAuthor = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      extendedMode: true,
      author: {
        reference: author,
      },
    });

    // We are acting as a Practitioner
    // Practitioner does *not* have the right to set the author
    // So even though we pass in an author,
    // We expect the Practitioner to be in the result.
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        author: {
          reference: fakeAuthor,
        },
      },
    });

    expect(patient?.meta?.author?.reference).toEqual(author);
  });

  test('Create resource with account', async () => {
    const author = 'Practitioner/' + randomUUID();
    const account = 'Organization/' + randomUUID();

    // This user does not have an access policy
    // So they can optionally set an account
    const repo = new Repository({
      extendedMode: true,
      author: {
        reference: author,
      },
    });

    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        account: {
          reference: account,
        },
      },
    });

    expect(patient?.meta?.author?.reference).toEqual(author);
    expect(patient?.meta?.account?.reference).toEqual(account);
  });

  test('Create resource with lastUpdated', async () => {
    const lastUpdated = '2020-01-01T12:00:00Z';

    // System systemRepo has the ability to write custom timestamps
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        lastUpdated,
      },
    });

    expect(patient?.meta?.lastUpdated).toEqual(lastUpdated);
  });

  test('Update resource with lastUpdated', async () => {
    const lastUpdated = '2020-01-01T12:00:00Z';

    // System systemRepo has the ability to write custom timestamps
    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      meta: {
        lastUpdated,
      },
    });
    expect(patient1?.meta?.lastUpdated).toEqual(lastUpdated);

    // But system cannot update the timestamp
    const patient2 = await systemRepo.updateResource<Patient>({
      ...(patient1 as Patient),
      active: true,
      meta: {
        lastUpdated,
      },
    });
    expect(patient2?.meta?.lastUpdated).not.toEqual(lastUpdated);
  });

  test('Search for Communications by Encounter', async () => {
    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patient1).toBeDefined();

    const encounter1 = await systemRepo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: {
        code: 'HH',
        display: 'home health',
      },
      subject: createReference(patient1 as Patient),
    });

    expect(encounter1).toBeDefined();

    const comm1 = await systemRepo.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      encounter: createReference(encounter1 as Encounter),
      subject: createReference(patient1 as Patient),
      sender: createReference(patient1 as Patient),
      payload: [{ contentString: 'This is a test' }],
    });

    expect(comm1).toBeDefined();

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Jones' }],
    });

    expect(patient2).toBeDefined();

    const encounter2 = await systemRepo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: {
        code: 'HH',
        display: 'home health',
      },
      subject: createReference(patient2 as Patient),
    });

    expect(encounter2).toBeDefined();

    const comm2 = await systemRepo.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      encounter: createReference(encounter2 as Encounter),
      subject: createReference(patient2 as Patient),
      sender: createReference(patient2 as Patient),
      payload: [{ contentString: 'This is another test' }],
    });

    expect(comm2).toBeDefined();

    const searchResult = await systemRepo.search({
      resourceType: 'Communication',
      filters: [
        {
          code: 'encounter',
          operator: Operator.EQUALS,
          value: getReferenceString(encounter1 as Encounter),
        },
      ],
    });

    expect(searchResult?.entry?.length).toEqual(1);
    expect(searchResult?.entry?.[0]?.resource?.id).toEqual(comm1?.id);
  });

  test('Search for Communications by ServiceRequest', async () => {
    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    expect(patient1).toBeDefined();

    const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      code: {
        text: 'text',
      },
      subject: createReference(patient1 as Patient),
    });

    expect(serviceRequest1).toBeDefined();

    const comm1 = await systemRepo.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(serviceRequest1 as ServiceRequest)],
      subject: createReference(patient1 as Patient),
      sender: createReference(patient1 as Patient),
      payload: [{ contentString: 'This is a test' }],
    });

    expect(comm1).toBeDefined();

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Jones' }],
    });

    expect(patient2).toBeDefined();

    const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      code: {
        text: 'test',
      },
      subject: createReference(patient2 as Patient),
    });

    expect(serviceRequest2).toBeDefined();

    const comm2 = await systemRepo.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      basedOn: [createReference(serviceRequest2 as ServiceRequest)],
      subject: createReference(patient2 as Patient),
      sender: createReference(patient2 as Patient),
      payload: [{ contentString: 'This is another test' }],
    });

    expect(comm2).toBeDefined();

    const searchResult = await systemRepo.search({
      resourceType: 'Communication',
      filters: [
        {
          code: 'based-on',
          operator: Operator.EQUALS,
          value: getReferenceString(serviceRequest1 as ServiceRequest),
        },
      ],
    });

    expect(searchResult?.entry?.length).toEqual(1);
    expect(searchResult?.entry?.[0]?.resource?.id).toEqual(comm1?.id);
  });

  test('Search for QuestionnaireResponse by Questionnaire', async () => {
    const questionnaire = await systemRepo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
    });

    const response1 = await systemRepo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: getReferenceString(questionnaire),
    });

    await systemRepo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: `Questionnaire/${randomUUID()}`,
    });

    const bundle = await systemRepo.search({
      resourceType: 'QuestionnaireResponse',
      filters: [
        {
          code: 'questionnaire',
          operator: Operator.EQUALS,
          value: getReferenceString(questionnaire),
        },
      ],
    });
    expect(bundle.entry?.length).toEqual(1);
    expect(bundle.entry?.[0]?.resource?.id).toEqual(response1.id);
  });

  test('Search for token in array', async () => {
    const bundle = await systemRepo.search({
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

    expect(bundle?.entry?.find((e) => (e.resource as SearchParameter).code === 'name')).toBeDefined();
    expect(bundle?.entry?.find((e) => (e.resource as SearchParameter).code === 'email')).toBeDefined();
  });

  test('Search sort by Patient.id', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'id' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.meta.lastUpdated', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'lastUpdated' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.identifier', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'identifier' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.name', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'name' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.given', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'given' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.address', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'address' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.telecom', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'telecom' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.email', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'email' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Search sort by Patient.birthDate', async () => {
    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      sortRules: [{ code: 'birthdate' }],
    });

    expect(bundle).toBeDefined();
  });

  test('Filter and sort on same search parameter', async () => {
    const createBundle = await processBatch(systemRepo, {
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

    expect(createBundle).toBeDefined();

    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      filters: [{ code: 'family', operator: Operator.EQUALS, value: 'Simpson' }],
      sortRules: [{ code: 'family' }],
    });

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
    const patient1 = await repo1.createResource<Patient>({
      resourceType: 'Patient',
    });

    expect(patient1).toBeDefined();
    expect(patient1?.id).toBeDefined();

    const patient2 = await repo1.readResource('Patient', patient1?.id as string);
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
    try {
      await repo2.readResource('Patient', patient1?.id as string);
      fail('Should have thrown');
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(outcome.id).toEqual('not-found');
    }
  });

  test('Read history after delete', async () => {
    // Create the patient
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    const history1 = await systemRepo.readHistory('Patient', patient?.id as string);
    expect(history1?.entry?.length).toBe(1);

    // Delete the patient
    await systemRepo.deleteResource('Patient', patient?.id as string);

    const history2 = await systemRepo.readHistory('Patient', patient?.id as string);
    expect(history2?.entry?.length).toBe(2);

    // Restore the patient
    await systemRepo.updateResource({ ...patient, meta: undefined });

    const history3 = await systemRepo.readHistory('Patient', patient?.id as string);
    expect(history3?.entry?.length).toBe(3);

    const entries = history3?.entry as BundleEntry[];
    expect(entries[0].response?.status).toEqual('200');
    expect(entries[0].resource).toBeDefined();
    expect(entries[1].response?.status).toEqual('410');
    expect((entries[1].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toMatch(/Deleted on /);
    expect(entries[1].resource).toBeUndefined();
    expect(entries[2].response?.status).toEqual('200');
    expect(entries[2].resource).toBeDefined();
  });

  test('Search birthDate after delete', async () => {
    const family = randomUUID();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family }],
      birthDate: '1971-02-02',
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'family',
          operator: Operator.EQUALS,
          value: family,
        },
        {
          code: 'birthdate',
          operator: Operator.EQUALS,
          value: '1971-02-02',
        },
      ],
    });

    expect(searchResult1?.entry?.length).toEqual(1);
    expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

    await systemRepo.deleteResource('Patient', patient?.id as string);

    const searchResult2 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'family',
          operator: Operator.EQUALS,
          value: family,
        },
        {
          code: 'birthdate',
          operator: Operator.EQUALS,
          value: '1971-02-02',
        },
      ],
    });

    expect(searchResult2?.entry?.length).toEqual(0);
  });

  test('Search identifier after delete', async () => {
    const identifier = randomUUID();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });

    expect(searchResult1?.entry?.length).toEqual(1);
    expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

    await systemRepo.deleteResource('Patient', patient?.id as string);

    const searchResult2 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });

    expect(searchResult2?.entry?.length).toEqual(0);
  });

  test('String filter', async () => {
    const bundle1 = await systemRepo.search({
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
    expect(bundle1?.entry?.length).toEqual(2);
    expect((bundle1?.entry?.[0]?.resource as StructureDefinition).name).toEqual('Questionnaire');
    expect((bundle1?.entry?.[1]?.resource as StructureDefinition).name).toEqual('QuestionnaireResponse');

    const bundle2 = await systemRepo.search({
      resourceType: 'StructureDefinition',
      filters: [
        {
          code: 'name',
          operator: Operator.EXACT,
          value: 'Questionnaire',
        },
      ],
    });
    expect(bundle2?.entry?.length).toEqual(1);
    expect((bundle2?.entry?.[0]?.resource as StructureDefinition).name).toEqual('Questionnaire');
  });

  test('Filter by _id', async () => {
    // Unique family name to isolate the test
    const family = randomUUID();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family }],
    });
    expect(patient).toBeDefined();

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: '_id',
          operator: Operator.EQUALS,
          value: patient?.id as string,
        },
      ],
    });

    expect(searchResult1?.entry?.length).toEqual(1);
    expect(bundleContains(searchResult1 as Bundle, patient as Patient)).toEqual(true);

    const searchResult2 = await systemRepo.search({
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

    expect(searchResult2?.entry?.length).toEqual(0);
  });

  test('Filter by _project', async () => {
    const project1 = randomUUID();
    const project2 = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice1'], family: 'Smith1' }],
      meta: {
        project: project1,
      },
    });
    expect(patient1).toBeDefined();

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice2'], family: 'Smith2' }],
      meta: {
        project: project2,
      },
    });
    expect(patient2).toBeDefined();

    const bundle = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: '_project',
          operator: Operator.EQUALS,
          value: project1,
        },
      ],
    });
    expect(bundle?.entry?.length).toEqual(1);
    expect(bundleContains(bundle as Bundle, patient1 as Patient)).toEqual(true);
    expect(bundleContains(bundle as Bundle, patient2 as Patient)).toEqual(false);
  });

  test('Handle malformed _lastUpdated', async () => {
    try {
      await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: '_lastUpdated',
            operator: Operator.GREATER_THAN,
            value: 'xyz',
          },
        ],
      });
      fail('Expected error');
    } catch (err) {
      expect(normalizeErrorString(err)).toEqual('Invalid date value: xyz');
    }
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

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family }],
      meta: {
        lastUpdated: nowMinus1Second.toISOString(),
      },
    });
    expect(patient1).toBeDefined();

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family }],
      meta: {
        lastUpdated: nowMinus2Seconds.toISOString(),
      },
    });
    expect(patient2).toBeDefined();

    // Greater than (newer than) 2 seconds ago should only return patient 1
    const searchResult1 = await systemRepo.search({
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

    expect(bundleContains(searchResult1 as Bundle, patient1 as Patient)).toEqual(true);
    expect(bundleContains(searchResult1 as Bundle, patient2 as Patient)).toEqual(false);

    // Greater than (newer than) or equal to 2 seconds ago should return both patients
    const searchResult2 = await systemRepo.search({
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

    expect(bundleContains(searchResult2 as Bundle, patient1 as Patient)).toEqual(true);
    expect(bundleContains(searchResult2 as Bundle, patient2 as Patient)).toEqual(true);

    // Less than (older than) to 1 seconds ago should only return patient 2
    const searchResult3 = await systemRepo.search({
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

    expect(bundleContains(searchResult3 as Bundle, patient1 as Patient)).toEqual(false);
    expect(bundleContains(searchResult3 as Bundle, patient2 as Patient)).toEqual(true);

    // Less than (older than) or equal to 1 seconds ago should return both patients
    const searchResult4 = await systemRepo.search({
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

    expect(bundleContains(searchResult4 as Bundle, patient1 as Patient)).toEqual(true);
    expect(bundleContains(searchResult4 as Bundle, patient2 as Patient)).toEqual(true);
  });

  test('Sort by _lastUpdated', async () => {
    const project = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice1'], family: 'Smith1' }],
      meta: {
        lastUpdated: '2020-01-01T00:00:00.000Z',
        project,
      },
    });
    expect(patient1).toBeDefined();

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice2'], family: 'Smith2' }],
      meta: {
        lastUpdated: '2020-01-02T00:00:00.000Z',
        project,
      },
    });
    expect(patient2).toBeDefined();

    const bundle3 = await systemRepo.search({
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
    expect(bundle3?.entry?.length).toEqual(2);
    expect(bundle3?.entry?.[0]?.resource?.id).toEqual(patient1?.id);
    expect(bundle3?.entry?.[1]?.resource?.id).toEqual(patient2?.id);

    const bundle4 = await systemRepo.search({
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
    expect(bundle4?.entry?.length).toEqual(2);
    expect(bundle4?.entry?.[0]?.resource?.id).toEqual(patient2?.id);
    expect(bundle4?.entry?.[1]?.resource?.id).toEqual(patient1?.id);
  });

  test('Unsupported date search param', async () => {
    const resource = await systemRepo.createResource<Encounter>({
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
    expect(resource).toBeDefined();
    expect(resource?.id).toBeDefined();
  });

  test('Filter by Coding', async () => {
    const auditEvents = [] as AuditEvent[];

    for (let i = 0; i < 3; i++) {
      const resource = await systemRepo.createResource<AuditEvent>({
        resourceType: 'AuditEvent',
        recorded: new Date().toISOString(),
        type: {
          code: randomUUID(),
        },
        agent: [
          {
            who: { reference: 'Practitioner/' + randomUUID() },
            requestor: true,
          },
        ],
        source: {
          observer: { reference: 'Practitioner/' + randomUUID() },
        },
      });
      auditEvents.push(resource);
    }

    for (let i = 0; i < 3; i++) {
      const bundle = await systemRepo.search({
        resourceType: 'AuditEvent',
        filters: [
          {
            code: 'type',
            operator: Operator.CONTAINS,
            value: auditEvents[i].type?.code as string,
          },
        ],
      });
      expect(bundle.entry?.length).toEqual(1);
      expect(bundle.entry?.[0]?.resource?.id).toEqual(auditEvents[i].id);
    }
  });

  test('Filter by CodeableConcept', async () => {
    const x1 = randomUUID();
    const x2 = randomUUID();
    const x3 = randomUUID();

    // Create test patient
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'CodeableConcept' }],
    });

    // Use code.coding[0].code
    const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
      code: {
        coding: [
          {
            code: x1,
          },
        ],
      },
    });

    // Use code.coding[0].display
    const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
      code: {
        coding: [
          {
            display: x2,
          },
        ],
      },
    });

    // Use code.text
    const serviceRequest3 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
      code: {
        text: x3,
      },
    });

    const bundle1 = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'code',
          operator: Operator.EQUALS,
          value: x1,
        },
      ],
    });
    expect(bundle1.entry?.length).toEqual(1);
    expect(bundleContains(bundle1, serviceRequest1)).toEqual(true);
    expect(bundleContains(bundle1, serviceRequest2)).toEqual(false);
    expect(bundleContains(bundle1, serviceRequest3)).toEqual(false);

    const bundle2 = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'code',
          operator: Operator.EQUALS,
          value: x2,
        },
      ],
    });
    expect(bundle2.entry?.length).toEqual(1);
    expect(bundleContains(bundle2, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle2, serviceRequest2)).toEqual(true);
    expect(bundleContains(bundle2, serviceRequest3)).toEqual(false);

    const bundle3 = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'code',
          operator: Operator.EQUALS,
          value: x3,
        },
      ],
    });
    expect(bundle3.entry?.length).toEqual(1);
    expect(bundleContains(bundle3, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle3, serviceRequest2)).toEqual(false);
    expect(bundleContains(bundle3, serviceRequest3)).toEqual(true);
  });

  test('Filter by Quantity.value', async () => {
    const code = randomUUID();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Quantity' }],
    });

    const observation1 = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: { coding: [{ code }] },
      valueQuantity: { value: 1, unit: 'mg' },
    });

    const observation2 = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: { coding: [{ code }] },
      valueQuantity: { value: 5, unit: 'mg' },
    });

    const observation3 = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: { coding: [{ code }] },
      valueQuantity: { value: 10, unit: 'mg' },
    });

    const bundle1 = await systemRepo.search<Observation>({
      resourceType: 'Observation',
      filters: [{ code: 'code', operator: Operator.EQUALS, value: code }],
      sortRules: [{ code: 'value-quantity', descending: false }],
    });
    expect(bundle1.entry?.length).toEqual(3);
    expect(bundle1.entry?.[0]?.resource?.id).toEqual(observation1.id);
    expect(bundle1.entry?.[1]?.resource?.id).toEqual(observation2.id);
    expect(bundle1.entry?.[2]?.resource?.id).toEqual(observation3.id);

    const bundle2 = await systemRepo.search<Observation>({
      resourceType: 'Observation',
      filters: [{ code: 'code', operator: Operator.EQUALS, value: code }],
      sortRules: [{ code: 'value-quantity', descending: true }],
    });
    expect(bundle2.entry?.length).toEqual(3);
    expect(bundle2.entry?.[0]?.resource?.id).toEqual(observation3.id);
    expect(bundle2.entry?.[1]?.resource?.id).toEqual(observation2.id);
    expect(bundle2.entry?.[2]?.resource?.id).toEqual(observation1.id);

    const bundle3 = await systemRepo.search<Observation>({
      resourceType: 'Observation',
      filters: [
        { code: 'code', operator: Operator.EQUALS, value: code },
        { code: 'value-quantity', operator: Operator.GREATER_THAN, value: '8' },
      ],
    });
    expect(bundle3.entry?.length).toEqual(1);
    expect(bundle3.entry?.[0]?.resource?.id).toEqual(observation3.id);
  });

  test('Reindex resource type as non-admin', async () => {
    const repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'Practitioner/' + randomUUID(),
      },
    });

    try {
      await repo.reindexResourceType('Practitioner');
      fail('Expected error');
    } catch (err) {
      expect(isOk(err as OperationOutcome)).toBe(false);
    }
  });

  test('Reindex resource as non-admin', async () => {
    const repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'Practitioner/' + randomUUID(),
      },
    });

    try {
      await repo.reindexResource('Practitioner', randomUUID());
      fail('Expected error');
    } catch (err) {
      expect(isOk(err as OperationOutcome)).toBe(false);
    }
  });

  test('Reindex resource not found', async () => {
    try {
      await systemRepo.reindexResource('Practitioner', randomUUID());
      fail('Expected error');
    } catch (err) {
      expect(isOk(err as OperationOutcome)).toBe(false);
    }
  });

  test('Reindex success', async () => {
    await systemRepo.reindexResourceType('Practitioner');
  });

  test('Remove property', async () => {
    const value = randomUUID();

    // Create a patient with an identifier
    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Identifier'], family: 'Test' }],
      identifier: [{ system: 'https://example.com/', value }],
    });

    // Search for patient by identifier
    // This should succeed
    const bundle1 = await systemRepo.search<Patient>({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value,
        },
      ],
    });
    expect(bundle1.entry?.length).toEqual(1);

    const { identifier, ...rest } = patient1;
    expect(identifier).toBeDefined();
    expect((rest as Patient).identifier).toBeUndefined();

    const patient2 = await systemRepo.updateResource<Patient>(rest);
    expect(patient2.identifier).toBeUndefined();

    // Try to search for the identifier
    // This should return empty result
    const bundle2 = await systemRepo.search<Patient>({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value,
        },
      ],
    });
    expect(bundle2.entry?.length).toEqual(0);
  });

  test('ServiceRequest.orderDetail search', async () => {
    const orderDetailText = randomUUID();
    const orderDetailCode = randomUUID();

    const serviceRequest = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
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

    const bundle1 = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'order-detail',
          operator: Operator.CONTAINS,
          value: orderDetailText,
        },
      ],
    });
    expect(bundle1.entry?.length).toEqual(1);
    expect(bundle1.entry?.[0]?.resource?.id).toEqual(serviceRequest.id);
  });

  test('Delete Questionnaire.subjectType', async () => {
    const nonce = randomUUID();

    const resource1 = await systemRepo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      subjectType: [nonce as ResourceType],
    });

    const resource2 = await systemRepo.search({
      resourceType: 'Questionnaire',
      filters: [
        {
          code: 'subject-type',
          operator: Operator.EQUALS,
          value: nonce,
        },
      ],
    });
    expect(resource2.entry?.length).toEqual(1);

    delete resource1.subjectType;
    await systemRepo.updateResource<Questionnaire>(resource1);

    const resource4 = await systemRepo.search({
      resourceType: 'Questionnaire',
      filters: [
        {
          code: 'subject-type',
          operator: Operator.EQUALS,
          value: nonce,
        },
      ],
    });
    expect(resource4.entry?.length).toEqual(0);
  });

  test('Comma separated value', async () => {
    const category = randomUUID();
    const codes = [randomUUID(), randomUUID(), randomUUID()];
    const serviceRequests = [];

    for (const code of codes) {
      const serviceRequest = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        category: [{ coding: [{ code: category }] }],
        code: { coding: [{ code: code }] },
      });
      serviceRequests.push(serviceRequest);
    }

    const bundle1 = await systemRepo.search(
      parseSearchRequest('ServiceRequest', { category, code: `${codes[0]},${codes[1]}` })
    );
    expect(bundle1.entry?.length).toEqual(2);
    expect(bundleContains(bundle1, serviceRequests[0])).toEqual(true);
    expect(bundleContains(bundle1, serviceRequests[1])).toEqual(true);
  });

  test('Token not equals', async () => {
    const category = randomUUID();
    const code1 = randomUUID();
    const code2 = randomUUID();

    const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/' + randomUUID() },
      category: [{ coding: [{ code: category }] }],
      code: { coding: [{ code: code1 }] },
    });

    const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/' + randomUUID() },
      category: [{ coding: [{ code: category }] }],
      code: { coding: [{ code: code2 }] },
    });

    const bundle1 = await systemRepo.search(parseSearchRequest('ServiceRequest', { category, 'code:not': code1 }));
    expect(bundle1.entry?.length).toEqual(1);
    expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);
  });

  test('Token array not equals', async () => {
    const category1 = randomUUID();
    const category2 = randomUUID();
    const code = randomUUID();

    const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/' + randomUUID() },
      category: [{ coding: [{ code: category1 }] }],
      code: { coding: [{ code }] },
    });

    const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/' + randomUUID() },
      category: [{ coding: [{ code: category2 }] }],
      code: { coding: [{ code }] },
    });

    const bundle1 = await systemRepo.search(parseSearchRequest('ServiceRequest', { code, 'category:not': category1 }));
    expect(bundle1.entry?.length).toEqual(1);
    expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);
  });

  test('Null token array not equals', async () => {
    const category1 = randomUUID();
    const code = randomUUID();

    const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/' + randomUUID() },
      category: [{ coding: [{ code: category1 }] }],
      code: { coding: [{ code }] },
    });

    const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/' + randomUUID() },
      code: { coding: [{ code }] },
    });

    const bundle1 = await systemRepo.search(parseSearchRequest('ServiceRequest', { code, 'category:not': category1 }));
    expect(bundle1.entry?.length).toEqual(1);
    expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);
  });

  test('Missing', async () => {
    const code = randomUUID();

    // Test both an array column (specimen) and a non-array column (encounter),
    // because the resulting SQL could be subtly different.

    const serviceRequest1 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      code: { coding: [{ code }] },
      subject: { reference: 'Patient/' + randomUUID() },
      specimen: [{ reference: 'Specimen/' + randomUUID() }],
      encounter: { reference: 'Encounter/' + randomUUID() },
    });

    const serviceRequest2 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      code: { coding: [{ code }] },
      subject: { reference: 'Patient/' + randomUUID() },
    });

    const bundle1 = await systemRepo.search(parseSearchRequest('ServiceRequest', { code, 'specimen:missing': 'true' }));
    expect(bundle1.entry?.length).toEqual(1);
    expect(bundleContains(bundle1, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle1, serviceRequest2)).toEqual(true);

    const bundle2 = await systemRepo.search(
      parseSearchRequest('ServiceRequest', { code, 'specimen:missing': 'false' })
    );
    expect(bundle2.entry?.length).toEqual(1);
    expect(bundleContains(bundle2, serviceRequest1)).toEqual(true);
    expect(bundleContains(bundle2, serviceRequest2)).toEqual(false);

    const bundle3 = await systemRepo.search(
      parseSearchRequest('ServiceRequest', { code, 'encounter:missing': 'true' })
    );
    expect(bundle3.entry?.length).toEqual(1);
    expect(bundleContains(bundle3, serviceRequest1)).toEqual(false);
    expect(bundleContains(bundle3, serviceRequest2)).toEqual(true);

    const bundle4 = await systemRepo.search(
      parseSearchRequest('ServiceRequest', { code, 'encounter:missing': 'false' })
    );
    expect(bundle4.entry?.length).toEqual(1);
    expect(bundleContains(bundle4, serviceRequest1)).toEqual(true);
    expect(bundleContains(bundle4, serviceRequest2)).toEqual(false);
  });

  test('Empty objects', async () => {
    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      contact: [{}],
    });

    const patient2 = await systemRepo.updateResource<Patient>({
      resourceType: 'Patient',
      id: patient1.id,
      contact: [{}],
    });
    expect(patient2?.id).toEqual(patient1?.id);
  });

  test('Starts after', async () => {
    // Create 2 appointments
    // One with a start date of 1 second ago
    // One with a start date of 2 seconds ago
    const code = randomUUID();
    const now = new Date();
    const nowMinus1Second = new Date(now.getTime() - 1000);
    const nowMinus2Seconds = new Date(now.getTime() - 2000);
    const nowMinus3Seconds = new Date(now.getTime() - 3000);

    const appt1 = await systemRepo.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      serviceType: [{ text: code }],
      participant: [{ status: 'accepted' }],
      start: nowMinus1Second.toISOString(),
    });
    expect(appt1).toBeDefined();

    const appt2 = await systemRepo.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      serviceType: [{ text: code }],
      participant: [{ status: 'accepted' }],
      start: nowMinus2Seconds.toISOString(),
    });
    expect(appt2).toBeDefined();

    // Greater than (newer than) 2 seconds ago should only return appt 1
    const searchResult1 = await systemRepo.search({
      resourceType: 'Appointment',
      filters: [
        {
          code: 'service-type',
          operator: Operator.EQUALS,
          value: code,
        },
        {
          code: 'date',
          operator: Operator.STARTS_AFTER,
          value: nowMinus2Seconds.toISOString(),
        },
      ],
    });

    expect(bundleContains(searchResult1 as Bundle, appt1 as Appointment)).toEqual(true);
    expect(bundleContains(searchResult1 as Bundle, appt2 as Appointment)).toEqual(false);

    // Greater than (newer than) or equal to 2 seconds ago should return both appts
    const searchResult2 = await systemRepo.search({
      resourceType: 'Appointment',
      filters: [
        {
          code: 'service-type',
          operator: Operator.EQUALS,
          value: code,
        },
        {
          code: 'date',
          operator: Operator.GREATER_THAN_OR_EQUALS,
          value: nowMinus2Seconds.toISOString(),
        },
      ],
    });

    expect(bundleContains(searchResult2 as Bundle, appt1 as Appointment)).toEqual(true);
    expect(bundleContains(searchResult2 as Bundle, appt2 as Appointment)).toEqual(true);

    // Less than (older than) to 1 seconds ago should only return appt 2
    const searchResult3 = await systemRepo.search({
      resourceType: 'Appointment',
      filters: [
        {
          code: 'service-type',
          operator: Operator.EQUALS,
          value: code,
        },
        {
          code: 'date',
          operator: Operator.STARTS_AFTER,
          value: nowMinus3Seconds.toISOString(),
        },
        {
          code: 'date',
          operator: Operator.ENDS_BEFORE,
          value: nowMinus1Second.toISOString(),
        },
      ],
    });

    expect(bundleContains(searchResult3 as Bundle, appt1 as Appointment)).toEqual(false);
    expect(bundleContains(searchResult3 as Bundle, appt2 as Appointment)).toEqual(true);

    // Less than (older than) or equal to 1 seconds ago should return both appts
    const searchResult4 = await systemRepo.search({
      resourceType: 'Appointment',
      filters: [
        {
          code: 'service-type',
          operator: Operator.EQUALS,
          value: code,
        },
        {
          code: 'date',
          operator: Operator.STARTS_AFTER,
          value: nowMinus3Seconds.toISOString(),
        },
        {
          code: 'date',
          operator: Operator.LESS_THAN_OR_EQUALS,
          value: nowMinus1Second.toISOString(),
        },
      ],
    });

    expect(bundleContains(searchResult4 as Bundle, appt1 as Appointment)).toEqual(true);
    expect(bundleContains(searchResult4 as Bundle, appt2 as Appointment)).toEqual(true);
  });

  test('Too many versions', async () => {
    // Create version 1
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ family: 'Test' }],
    });

    // Create versions 2-10
    for (let i = 0; i < 9; i++) {
      await systemRepo.updateResource<Patient>({
        ...patient,
        name: [{ family: `Test ${i}` }],
      });
    }

    // Try to create version 11
    try {
      await systemRepo.updateResource<Patient>({
        ...patient,
        name: [{ family: `Test too many requests` }],
      });
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(outcome.id).toEqual('too-many-requests');
    }
  });

  test('Boolean search', async () => {
    const family = randomUUID();
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ family }],
      active: true,
    });
    const searchResult = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: family,
        },
        {
          code: 'active',
          operator: Operator.EQUALS,
          value: 'true',
        },
      ],
    });
    expect(searchResult.entry).toHaveLength(1);
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);
  });

  test('Not equals with comma separated values', async () => {
    // Create 3 service requests
    // All 3 have the same category for test isolation
    // Each have a different code
    const category = randomUUID();
    const serviceRequests = [];
    for (let i = 0; i < 3; i++) {
      serviceRequests.push(
        await systemRepo.createResource({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'order',
          subject: { reference: 'Patient/' + randomUUID() },
          category: [{ text: category }],
          code: { text: randomUUID() },
        })
      );
    }

    // Search for service requests with category
    // and code "not equals" the first two separated by a comma
    const searchResult = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'category',
          operator: Operator.EQUALS,
          value: category,
        },
        {
          code: 'code',
          operator: Operator.NOT_EQUALS,
          value: serviceRequests[0].code.text + ',' + serviceRequests[1].code.text,
        },
      ],
    });
    expect(searchResult.entry).toHaveLength(1);
  });

  test('_id equals with comma separated values', async () => {
    // Create 3 service requests
    const serviceRequests = [];
    for (let i = 0; i < 3; i++) {
      serviceRequests.push(
        await systemRepo.createResource<ServiceRequest>({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'order',
          subject: { reference: 'Patient/' + randomUUID() },
          code: { text: randomUUID() },
        })
      );
    }

    // Search for service requests with _id equals the first two separated by a comma
    const searchResult = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: '_id',
          operator: Operator.EQUALS,
          value: serviceRequests[0].id + ',' + serviceRequests[1].id,
        },
      ],
    });
    expect(searchResult.entry).toHaveLength(2);
  });

  test('Error on invalid search parameter', async () => {
    try {
      await systemRepo.search({
        resourceType: 'ServiceRequest',
        filters: [
          {
            code: 'basedOn', // should be "based-on"
            operator: Operator.EQUALS,
            value: 'ServiceRequest/123',
          },
        ],
      });
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(outcome.issue?.[0]?.details?.text).toEqual('Unknown search parameter: basedOn');
    }
  });

  test('Patient search without resource type', async () => {
    // Create Patient
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
    });

    // Create AllergyIntolerance
    const allergyIntolerance = await systemRepo.createResource<AllergyIntolerance>({
      resourceType: 'AllergyIntolerance',
      patient: createReference(patient),
    });

    // Search by patient
    const searchResult = await systemRepo.search({
      resourceType: 'AllergyIntolerance',
      filters: [
        {
          code: 'patient',
          operator: Operator.EQUALS,
          value: patient.id as string,
        },
      ],
    });
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(allergyIntolerance.id);
  });

  test('Subject search without resource type', async () => {
    // Create Patient
    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
    });

    // Create Observation
    const observation = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
    });

    // Search by patient
    const searchResult = await systemRepo.search({
      resourceType: 'Observation',
      filters: [
        {
          code: 'subject',
          operator: Operator.EQUALS,
          value: patient.id as string,
        },
      ],
    });
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(observation.id);
  });

  test('Reverse include Provenance', async () => {
    const searchResult = await systemRepo.search({
      resourceType: 'Practitioner',
      revInclude: 'Provenance:target',
    });
    expect(searchResult.entry).not.toHaveLength(0);

    const provenanceEntry = searchResult.entry?.find((entry) => entry.resource?.resourceType === 'Provenance');
    expect(provenanceEntry).toBeDefined();
    expect(provenanceEntry?.search?.mode).toEqual('include');
  });
});
