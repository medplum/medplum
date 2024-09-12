import {
  ContentType,
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  isOk,
  LOINC,
  OperationOutcomeError,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import {
  AllergyIntolerance,
  Binary,
  Bundle,
  BundleEntry,
  BundleEntryRequest,
  Observation,
  OperationOutcome,
  Patient,
  Practitioner,
  SearchParameter,
  ServiceRequest,
  Subscription,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { processBatch } from './batch';
import { FhirRequest, FhirRouter } from './fhirrouter';
import { FhirRepository, MemoryRepository } from './repo';

const router: FhirRouter = new FhirRouter();
const repo: FhirRepository = new MemoryRepository();
const req: FhirRequest = {
  method: 'POST',
  pathname: '/',
  params: {},
  query: {},
  body: '',
  config: { transactions: true },
};

describe('Batch', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('Process batch with missing bundle type', async () => {
    try {
      await processBatch(req, repo, router, { resourceType: 'Bundle' } as Bundle);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(isOk(outcome)).toBe(false);
      expect(outcome.issue?.[0].details?.text).toEqual('Unrecognized bundle type: undefined');
    }
  });

  test('Process batch with invalid bundle type', async () => {
    try {
      await processBatch(req, repo, router, { resourceType: 'Bundle', type: 'xyz' as unknown as 'batch' });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(isOk(outcome)).toBe(false);
      expect(outcome.issue?.[0].details?.text).toContain('Unrecognized bundle type');
    }
  });

  test('Process batch with missing entries', async () => {
    try {
      await processBatch(req, repo, router, { resourceType: 'Bundle', type: 'batch' });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(isOk(outcome)).toBe(false);
      expect(outcome.issue?.[0].details?.text).toContain('Missing bundle entries');
    }
  });

  test('Process batch success', async () => {
    const patientId = randomUUID();
    const observationId = randomUUID();

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: 'urn:uuid:' + patientId,
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            id: patientId,
          },
        },
        {
          fullUrl: 'urn:uuid:' + observationId,
          request: {
            method: 'POST',
            url: 'Observation',
          },
          resource: {
            resourceType: 'Observation',
            status: 'final',
            id: observationId,
            subject: {
              reference: 'urn:uuid:' + patientId,
            },
            code: {
              text: 'test',
            },
          },
        },
        {
          // Search
          request: {
            method: 'GET',
            url: 'Patient?_count=1',
          },
        },
        {
          // Read resource
          request: {
            method: 'GET',
            url: 'Patient/' + randomUUID(),
          },
        },
        {
          // Delete resource
          request: {
            method: 'DELETE',
            url: 'Patient/' + randomUUID(),
          },
        },
      ],
    });

    expect(bundle).toBeDefined();
    expect(bundle.type).toEqual('batch-response');
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(5);
    expect(results[0].response?.status).toEqual('201');
    expect(results[1].response?.status).toEqual('201');
    expect(results[2].response?.status).toEqual('200');
    expect(results[2].resource).toBeDefined();
    expect((results[2].resource as Bundle).entry?.length).toEqual(1);
    expect(results[3].response?.status).toEqual('404');
    expect(results[4].response?.status).toEqual('404');

    const patient = await repo.readReference({
      reference: results[0].response?.location as string,
    });
    expect(patient).toBeDefined();

    const observation = await repo.readReference({
      reference: results[1].response?.location as string,
    });
    expect(observation).toBeDefined();
    expect((observation as Observation).subject?.reference).toEqual('Patient/' + patient.id);
  });

  test('Process batch create success', async () => {
    const bundle = await processBatch(req, repo, router, {
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
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('201');
  });

  test('Process batch create missing resource', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
  });

  test('Process batch create missing resourceType', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {} as any,
        },
      ],
    });
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry?.[0]?.response?.status).toEqual('400');
  });

  test('Process batch create ignore http fullUrl', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: 'https://example.com/ignore-this',
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('201');
  });

  test('Process batch create does not rewrite identifier', async () => {
    const id = randomUUID();

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: 'urn:uuid:' + id,
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            id,
            identifier: [
              {
                system: 'https://github.com/synthetichealth/synthea',
                value: id,
              },
            ],
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('201');

    const readResult = await repo.readReference({
      reference: results[0].response?.location as string,
    });
    expect(readResult).toBeDefined();
    expect((readResult as Patient).identifier?.[0]?.value).toEqual(id);
  });

  test('Process batch create ifNoneExist success', async () => {
    const identifier = randomUUID();

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=' + identifier,
          },
          resource: {
            resourceType: 'Patient',
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=' + identifier,
          },
          resource: {
            resourceType: 'Patient',
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(2);
    expect(results[0].response?.status).toEqual('201');
    expect(results[1].response?.status).toEqual('200');
    expect(results[1].response?.location).toEqual(results[0].response?.location);
  });

  test('Process batch create ifNoneExist multiple matches', async () => {
    const identifier = randomUUID();

    // This is a bit contrived...
    // First, intentionally create 2 patients with duplicate identifiers
    // Then, the 3rd entry use ifNoneExists
    // The search will return 2 patients, which causes the entry to fail
    const bundle = await processBatch(req, repo, router, {
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
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=' + identifier,
          },
          resource: {
            resourceType: 'Patient',
            identifier: [
              {
                system: 'test',
                value: identifier,
              },
            ],
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(3);
    expect(results[0].response?.status).toEqual('201');
    expect(results[1].response?.status).toEqual('201');
    expect(results[2].response?.status).toEqual('412');
  });

  test('Use ifNoneExist result in other reference', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });

    // Create a Practitioner
    const identifier = randomUUID();
    const practitionerData: Practitioner = {
      resourceType: 'Practitioner',
      name: [{ given: ['Batch'], family: 'Test' }],
      identifier: [{ system: 'https://example.com', value: identifier }],
    };
    const practitioner = await repo.createResource(practitionerData);
    expect(practitioner.id).toBeDefined();

    // Execute a batch that looks for the practitioner and references the result
    // Use ifNoneExist, which should return the existing practitioner
    const urnUuid = 'urn:uuid:' + randomUUID();
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: urnUuid,
          request: {
            method: 'POST',
            url: 'Practitioner',
            ifNoneExist: 'identifier=https://example.com|' + identifier,
          },
          resource: practitionerData,
        },
        {
          request: { method: 'POST', url: 'ServiceRequest' },
          resource: {
            resourceType: 'ServiceRequest',
            status: 'active',
            intent: 'order',
            subject: createReference(patient),
            code: { coding: [{ system: LOINC, code: '12345-6' }] },
            requester: { reference: urnUuid },
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toHaveLength(2);
    expect(bundle.entry?.[0]?.response?.status).toEqual('200');
    expect((bundle.entry?.[1]?.resource as ServiceRequest).requester?.reference).toEqual(
      getReferenceString(practitioner)
    );
  });

  test('Process batch update', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
    });

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PUT',
            url: 'Patient/' + patient.id,
          },
          resource: {
            ...patient,
            active: true,
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('200');
  });

  test('Process batch update missing resource', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PUT',
            url: 'Patient/' + randomUUID(),
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
  });

  test('Process batch patch', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
    });

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          // Entry 1: Simple patch (success)
          request: {
            method: 'PATCH',
            url: 'Patient/' + patient.id,
          },
          resource: {
            resourceType: 'Binary',
            contentType: ContentType.JSON_PATCH,
            data: Buffer.from(JSON.stringify([{ op: 'add', path: '/active', value: true }]), 'utf8').toString('base64'),
          },
        },
        {
          // Entry 2: Empty body (error)
          request: {
            method: 'PATCH',
            url: 'Patient/' + patient.id,
          },
          resource: {
            resourceType: 'Binary',
            contentType: ContentType.JSON_PATCH,
            data: Buffer.from('null', 'utf8').toString('base64'),
          },
        },
        {
          // Entry 3: Non-array body (error)
          request: {
            method: 'PATCH',
            url: 'Patient/' + patient.id,
          },
          resource: {
            resourceType: 'Binary',
            contentType: ContentType.JSON_PATCH,
            data: Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64'),
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(3);
    expect(results[0].response?.status).toEqual('200');
    expect(results[1].response?.status).toEqual('400');
    expect(results[1].response?.outcome?.issue?.[0]?.details?.text).toEqual('Patch body must be an array');
    expect(results[2].response?.status).toEqual('400');
    expect(results[2].response?.outcome?.issue?.[0]?.details?.text).toEqual('Patch body must be an array');
  });

  test('JSONPath error messages', async () => {
    const serviceRequest = await repo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/' + randomUUID() },
    });

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PATCH',
            url: 'ServiceRequest/' + serviceRequest.id,
          },
          resource: {
            resourceType: 'Binary',
            contentType: ContentType.JSON_PATCH,
            data: Buffer.from(JSON.stringify([{ op: 'replace', path: 'status', value: 'final' }]), 'utf8').toString(
              'base64'
            ),
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Invalid JSON Pointer: status'
    );
  });

  test('JSONPatch error messages', async () => {
    const serviceRequest = await repo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/' + randomUUID() },
    });

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PATCH',
            url: 'ServiceRequest/' + serviceRequest.id,
          },
          resource: {
            resourceType: 'Binary',
            contentType: ContentType.JSON_PATCH,
            data: Buffer.from(JSON.stringify([{ op: 'not-an-op', path: '/status', value: 'final' }]), 'utf8').toString(
              'base64'
            ),
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Invalid operation: not-an-op'
    );
  });

  test('Process batch patch invalid url', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PATCH',
            url: 'Patient',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('404');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual('Not found');
  });

  test('Process batch patch missing resource', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PATCH',
            url: 'Patient/' + randomUUID(),
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Patch entry must include a Binary resource'
    );
  });

  test('Process batch patch wrong patch type', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PATCH',
            url: 'Patient/' + randomUUID(),
          },
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Patch entry must include a Binary resource'
    );
  });

  test('Process batch patch wrong patch type', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PATCH',
            url: 'Patient/' + randomUUID(),
          },
          resource: {
            resourceType: 'Binary',
          } as Binary,
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Missing entry.resource.data'
    );
  });

  test('Process batch delete', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
    });

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'DELETE',
            url: 'Patient/' + patient.id,
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('200');
  });

  test('Process batch delete invalid URL', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'DELETE',
            url: 'Patientx/12',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('404');
  });

  test('Process batch missing request', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          // Empty entry
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Missing Bundle entry request method'
    );
  });

  test('Process batch missing request.method', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            url: 'Patient',
          } as BundleEntryRequest,
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Missing Bundle entry request method'
    );
  });

  test('Process batch unsupported request.method', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'XXX' as any,
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });

    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry?.[0]?.response?.status).toEqual('404');
  });

  test('Process batch missing request.url', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
          } as BundleEntryRequest,
          resource: {
            resourceType: 'Patient',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(1);
    expect(results[0].response?.status).toEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toEqual(
      'Missing Bundle entry request URL'
    );
  });

  test('Process batch not found', async () => {
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'GET',
            url: 'x/x/x/x/x',
          },
        },
        {
          request: {
            method: 'POST',
            url: 'x/x/x/x/x',
          },
        },
        {
          request: {
            method: 'PUT',
            url: 'x/x/x/x/x',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toEqual(3);
    for (const result of results) {
      expect(result.response?.status).toEqual('404');
    }
  });

  test('Process batch read history', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ family: 'Foo', given: ['Bar'] }],
    });

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'GET',
            url: `Patient/${patient.id}/_history`,
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();
  });

  test('Conditional interactions', async () => {
    const patientIdentifier = randomUUID();
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      identifier: [{ value: patientIdentifier }],
    });

    const newIdentifier = randomUUID();
    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'PUT',
            url: `Patient?identifier=${patientIdentifier}`,
          },
          resource: patient,
        },
        {
          request: {
            method: 'PUT',
            url: 'Patient?identifier=' + newIdentifier,
          },
          resource: { resourceType: 'Patient', identifier: [{ value: newIdentifier }] },
        },
        {
          request: {
            method: 'DELETE',
            url: 'Patient?identifier=' + randomUUID(),
          },
        },
      ],
    });
    expect(bundle.entry?.map((e) => e.response?.status)).toEqual(['200', '201', '200']);
  });

  describe('Process Transactions', () => {
    test('Embedded urn:uuid', async () => {
      const bundle = await processBatch(req, repo, router, {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            fullUrl: 'urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb',
            request: {
              method: 'POST',
              url: 'Questionnaire',
            },
            resource: {
              resourceType: 'Questionnaire',
              status: 'active',
              name: 'Example Questionnaire',
              title: 'Example Questionnaire',
              item: [
                {
                  linkId: 'q1',
                  type: 'string',
                  text: 'Question',
                },
              ],
            },
          },
          {
            fullUrl: 'urn:uuid:14b4f91f-1119-40b8-b10e-3db77cf1c191',
            request: {
              method: 'POST',
              url: 'Subscription',
            },
            resource: {
              resourceType: 'Subscription',
              status: 'active',
              reason: 'Test',
              criteria: 'QuestionnaireResponse?questionnaire=urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb',
              channel: {
                type: 'rest-hook',
                endpoint: 'urn:uuid:32178250-67a4-4ec9-89bc-d16f1d619403',
                payload: ContentType.FHIR_JSON,
              },
            },
          },
        ],
      });
      expect(bundle).toBeDefined();
      expect(bundle.type).toEqual('transaction-response');
      expect(bundle.entry).toBeDefined();

      const results = bundle.entry as BundleEntry[];
      expect(results.length).toEqual(2);
      expect(results[0].response?.status).toEqual('201');
      expect(results[1].response?.status).toEqual('201');

      const subscription = await repo.readReference<Subscription>({
        reference: results[1].response?.location as string,
      });
      expect(subscription.criteria).toMatch(
        /QuestionnaireResponse\?questionnaire=Questionnaire\/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/
      );
    });

    test('Transaction update after create', async () => {
      await expect(
        processBatch(req, repo, router, {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            {
              fullUrl: 'urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb',
              request: {
                method: 'POST',
                url: 'Patient',
              },
              resource: {
                resourceType: 'Patient',
                status: 'active',
              } as Patient,
            },
            {
              fullUrl: 'urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb',
              request: {
                method: 'PUT',
                url: 'urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb',
              },
              resource: {
                id: 'urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb',
                resourceType: 'Patient',
                status: 'active',
                name: [{ given: ['Jane'], family: 'Doe' }],
              } as Patient,
            },
          ],
        })
      ).rejects.toThrow();
    });
  });

  test('Valid null', async () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:adf86b3c-c254-47df-9e2d-81c4a922f6e7',
          request: {
            method: 'POST',
            url: 'AllergyIntolerance',
          },
          resource: {
            resourceType: 'AllergyIntolerance',
            category: [null],
            patient: {
              display: 'patient',
            },
            _category: [
              {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
                    valueCode: 'unsupported',
                  },
                ],
              },
            ],
          } as unknown as AllergyIntolerance,
        },
      ],
    };

    const result = await processBatch(req, repo, router, bundle);
    expect(result).toBeDefined();
  });

  test('Concurrent conditional create in transactions', async () => {
    const patientIdentifier = randomUUID();
    const encounterIdentifier = randomUUID();
    const conditionIdentifier = randomUUID();

    const tx: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:' + patientIdentifier,
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=http://example.com|' + patientIdentifier,
          },
          resource: {
            resourceType: 'Patient',
            name: [{ given: ['Bobby' + patientIdentifier], family: 'Tables' }],
            gender: 'unknown',
            identifier: [{ system: 'http://example.com', value: patientIdentifier }],
          },
        },
        {
          request: {
            method: 'PUT',
            url:
              'CareTeam?subject=urn:uuid:' + patientIdentifier + '&status=active&category=http://loinc.org|LA28865-6',
          },
          resource: {
            resourceType: 'CareTeam',
            status: 'active',
            category: [
              {
                coding: [{ system: 'http://loinc.org', code: 'LA28865-6' }],
                text: 'Holistic Wellness Squad',
              },
            ],
            subject: { reference: 'urn:uuid:' + patientIdentifier },
            participant: [
              { member: { reference: 'Practitioner?identifier=http://hl7.org.fhir/sid/us-npi|9941339108' } },
            ],
          },
        },
        {
          fullUrl: 'urn:uuid:' + encounterIdentifier,
          request: {
            method: 'POST',
            url: 'Encounter',
          },
          resource: {
            resourceType: 'Encounter',
            status: 'finished',
            class: {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'AMB',
            },
            subject: { reference: 'urn:uuid:' + patientIdentifier },
            diagnosis: [{ condition: { reference: 'urn:uuid:' + conditionIdentifier } }],
          },
        },
        {
          fullUrl: 'urn:uuid:' + conditionIdentifier,
          request: {
            method: 'POST',
            url: 'Condition',
          },
          resource: {
            resourceType: 'Condition',
            verificationStatus: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
            },
            subject: { reference: 'urn:uuid:' + patientIdentifier },
            encounter: { reference: 'urn:uuid:' + encounterIdentifier },
            asserter: { reference: 'Practitioner?identifier=http://hl7.org.fhir/sid/us-npi|9941339108' },
            code: {
              coding: [{ system: 'http://snomed.info/sct', code: '83157008' }],
              text: 'FFI',
            },
          },
        },
      ],
    };

    await expect(processBatch(req, repo, router, tx)).resolves.toBeDefined();
  });
});
