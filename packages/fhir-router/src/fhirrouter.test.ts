import {
  allOk,
  badRequest,
  created,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  multipleMatches,
  notFound,
  preconditionFailed,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, OperationOutcome, Patient, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { FhirRequest, FhirRouter } from './fhirrouter';
import { FhirRepository, MemoryRepository } from './repo';

const router: FhirRouter = new FhirRouter();
const repo: FhirRepository = new MemoryRepository();

describe('FHIR Router', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('Batch success', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/',
      body: {
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
            },
          },
        ],
      },
      params: {},
      query: {},
    };
    const [outcome, bundle] = (await router.handleRequest(request, repo)) as [OperationOutcome, Bundle];
    expect(outcome).toMatchObject(allOk);
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('201');
  });

  test('Batch invalid bundle', async () => {
    const request: FhirRequest = {
      method: 'POST',
      pathname: '/',
      body: { resourceType: 'Patient' },
      params: {},
      query: {},
    };
    const [outcome] = await router.handleRequest(request, repo);
    expect(outcome).toMatchObject(badRequest('Not a bundle'));
  });

  test('Read resource by ID', async () => {
    const [res1, patient] = await router.handleRequest(
      {
        method: 'POST',
        pathname: '/Patient',
        body: {
          resourceType: 'Patient',
          name: [{ given: ['John'], family: 'Doe' }],
        },
        params: {},
        query: {},
      },
      repo
    );
    expect(res1).toMatchObject(created);
    expect(patient).toBeDefined();

    const [res2, patient2] = await router.handleRequest(
      {
        method: 'GET',
        pathname: `/Patient/${patient?.id}`,
        body: {},
        params: {},
        query: {},
      },
      repo
    );
    expect(res2).toMatchObject(allOk);
    expect(patient2).toBeDefined();

    const [res3, patient3] = await router.handleRequest(
      {
        method: 'GET',
        pathname: `/Patient/${patient?.id}/_history/${patient?.meta?.versionId}`,
        body: {},
        params: {},
        query: {},
      },
      repo
    );
    expect(res3).toMatchObject(allOk);
    expect(patient3).toBeDefined();
  });

  test('Read resource by ID not found', async () => {
    const [res2, patient2] = await router.handleRequest(
      {
        method: 'GET',
        pathname: `/Patient/${randomUUID()}`,
        body: {},
        params: {},
        query: {},
      },
      repo
    );
    expect(res2).toMatchObject(notFound);
    expect(patient2).toBeUndefined();

    const [res3, patient3] = await router.handleRequest(
      {
        method: 'GET',
        pathname: `/Patient/${randomUUID()}/_history/${randomUUID()}`,
        body: {},
        params: {},
        query: {},
      },
      repo
    );
    expect(res3).toMatchObject(notFound);
    expect(patient3).toBeUndefined();
  });

  test('Update incorrect resource type', async () => {
    const [res] = await router.handleRequest(
      {
        method: 'PUT',
        pathname: '/Patient/123',
        body: {
          resourceType: 'ServiceRequest',
          id: '123',
        },
        params: {},
        query: {},
      },
      repo
    );
    expect(res).toMatchObject(badRequest('Incorrect resource type'));
  });

  test('Update incorrect ID', async () => {
    const [res] = await router.handleRequest(
      {
        method: 'PUT',
        pathname: '/Patient/123',
        body: {
          resourceType: 'Patient',
          id: '456',
        },
        params: {},
        query: {},
      },
      repo
    );
    expect(res).toMatchObject(badRequest('Incorrect resource ID'));
  });

  test('Update incorrect precondition', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const [res] = await router.handleRequest(
      {
        method: 'PUT',
        pathname: '/Patient/' + patient.id,
        body: patient,
        params: {},
        query: {},
        headers: { 'if-match': 'W/"incorrect"' },
      },
      repo
    );
    expect(res).toMatchObject(preconditionFailed);
  });

  test('Update with correct precondition', async () => {
    const [res1, patient] = await router.handleRequest(
      {
        method: 'POST',
        pathname: '/Patient',
        body: {
          resourceType: 'Patient',
          name: [{ given: ['John'], family: 'Doe' }],
          active: false,
        },
        params: {},
        query: {},
      },
      repo
    );
    expect(res1).toMatchObject(created);
    if (!patient) {
      fail('Expected patient to be defined');
    }
    const expectedVersion = patient.meta?.versionId;
    if (!expectedVersion) {
      fail('Expected version to be defined');
    }

    const [res2, updatedPatient] = await router.handleRequest(
      {
        method: 'PUT',
        pathname: `/Patient/${patient?.id}`,
        body: {
          ...patient,
          active: true,
        },
        params: {},
        query: {},
        headers: { 'if-match': `W/"${expectedVersion}"` },
      },
      repo
    );
    expect(res2).toMatchObject(allOk);
    expect((updatedPatient as Patient)?.active).toEqual(true);
  });

  test('Update incorrect precondition', async () => {
    const [res1, patient] = await router.handleRequest(
      {
        method: 'POST',
        pathname: '/Patient',
        body: {
          resourceType: 'Patient',
          name: [{ given: ['John'], family: 'Doe' }],
        },
        params: {},
        query: {},
      },
      repo
    );
    expect(res1).toMatchObject(created);
    if (!patient) {
      fail('Expected patient to be defined');
    }

    const [res2] = await router.handleRequest(
      {
        method: 'PUT',
        pathname: `/Patient/${patient?.id}`,
        body: {
          ...patient,
          status: 'active',
        },
        params: {},
        query: {},
        headers: { 'if-match': 'W/"test"' },
      },
      repo
    );
    expect(res2).toMatchObject(preconditionFailed);
  });

  test('Search by post', async () => {
    const [res, bundle] = await router.handleRequest(
      {
        method: 'POST',
        pathname: '/Patient/_search',
        body: {
          name: 'Simpson',
        },
        params: {},
        query: {},
      },
      repo
    );
    expect(res).toMatchObject(allOk);
    expect(bundle).toBeDefined();
  });

  test('Search multiple types', async () => {
    const [res, bundle] = await router.handleRequest(
      {
        method: 'GET',
        pathname: '/',
        body: {},
        params: {},
        query: {
          _type: 'Patient,Observation',
        },
      },
      repo
    );
    expect(res).toMatchObject(allOk);
    expect(bundle).toBeDefined();
  });

  test('Conditional update', async () => {
    const mrn = randomUUID();
    const patient: Patient = {
      resourceType: 'Patient',
      identifier: [{ system: 'http://example.com/mrn', value: mrn }],
    };
    const [res, resource] = await router.handleRequest(
      {
        method: 'PUT',
        pathname: '/Patient',
        body: patient,
        params: {},
        query: {
          identifier: 'http://example.com/mrn|' + mrn,
        },
      },
      repo
    );
    expect(res).toMatchObject(created);
    expect(resource).toMatchObject(patient);
  });

  test('Patch resource', async () => {
    const [res1, patient] = await router.handleRequest(
      {
        method: 'POST',
        pathname: '/Patient',
        body: {
          resourceType: 'Patient',
          name: [{ given: ['John'], family: 'Doe' }],
        },
        params: {},
        query: {},
      },
      repo
    );
    expect(res1).toMatchObject(created);
    expect(patient).toBeDefined();

    const [res2, patient2] = await router.handleRequest(
      {
        method: 'PATCH',
        pathname: `/Patient/${patient?.id}`,
        body: [{ op: 'add', path: '/active', value: true }],
        params: {},
        query: {},
      },
      repo
    );
    expect(res2).toMatchObject(allOk);
    expect(patient2).toBeDefined();
    expect((patient2 as Patient).active).toEqual(true);

    const [res3, patient3] = await router.handleRequest(
      {
        method: 'PATCH',
        pathname: `/Patient/${patient?.id}`,
        body: null,
        params: {},
        query: {},
      },
      repo
    );
    expect(res3).toMatchObject(badRequest('Empty patch body'));
    expect(patient3).toBeUndefined();

    const [res4, patient4] = await router.handleRequest(
      {
        method: 'PATCH',
        pathname: `/Patient/${patient?.id}`,
        body: { foo: 'bar' },
        params: {},
        query: {},
      },
      repo
    );
    expect(res4).toMatchObject(badRequest('Patch body must be an array'));
    expect(patient4).toBeUndefined();
  });

  test('Conditional delete', async () => {
    const mrn = randomUUID();
    const patient: Patient = {
      resourceType: 'Patient',
      gender: 'unknown',
      identifier: [{ system: 'http://example.com/mrn', value: mrn }],
    };

    await repo.createResource(patient);
    await repo.createResource({ ...patient, identifier: undefined });

    // Multiple matching resources, expected error response
    const [res3, resource3] = await router.handleRequest(
      {
        method: 'DELETE',
        pathname: '/Patient',
        body: patient,
        params: {},
        query: {
          gender: 'unknown',
        },
      },
      repo
    );
    expect(res3).toMatchObject(multipleMatches);
    expect(resource3).toBeUndefined();

    // Matching resource to be deleted
    const [res, resource] = await router.handleRequest(
      {
        method: 'DELETE',
        pathname: '/Patient',
        body: patient,
        params: {},
        query: {
          identifier: 'http://example.com/mrn|' + mrn,
        },
      },
      repo
    );
    expect(res).toMatchObject(allOk);
    expect(resource).toBeUndefined();

    // No matching resource, ignored
    const [res2, resource2] = await router.handleRequest(
      {
        method: 'DELETE',
        pathname: '/Patient',
        body: patient,
        params: {},
        query: {
          identifier: 'http://example.com/mrn|' + randomUUID(),
        },
      },
      repo
    );
    expect(res2).toMatchObject(allOk);
    expect(resource2).toBeUndefined();
  });

  test('Create resource with query param account', async () => {
    const mrn = randomUUID();
    const patient: Patient = {
      resourceType: 'Patient',
      identifier: [{ system: 'http://example.com/mrn', value: mrn }],
    };
    const [res, resource] = await router.handleRequest(
      {
        method: 'POST',
        pathname: '/Patient',
        body: patient,
        params: {},
        query: {
          _account: 'Organization/123',
        },
      },
      repo
    );
    expect(res).toMatchObject(created);
    expect(resource).toMatchObject(patient);
    expect(resource?.meta?.account?.reference).toEqual('Organization/123');
  });
});
