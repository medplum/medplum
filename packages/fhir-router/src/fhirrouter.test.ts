import {
  allOk,
  badRequest,
  created,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
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
    expect(res).toMatchObject(badRequest('Incorrect ID'));
  });

  test('Update incorrect precondition', async () => {
    const [res] = await router.handleRequest(
      {
        method: 'PUT',
        pathname: '/Patient/123',
        body: {
          resourceType: 'Patient',
          id: '123',
        },
        params: {},
        query: {},
        headers: { 'if-match': 'W/"test"' },
      },
      repo
    );
    expect(res).toMatchObject(preconditionFailed);
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
});
