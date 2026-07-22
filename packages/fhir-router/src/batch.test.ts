// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcomeError } from '@medplum/core';
import {
  badRequest,
  ContentType,
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  isOk,
  LOINC,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type {
  AllergyIntolerance,
  Binary,
  Bundle,
  BundleEntry,
  BundleEntryRequest,
  DiagnosticReport,
  Observation,
  OperationOutcome,
  Organization,
  Patient,
  Practitioner,
  SearchParameter,
  ServiceRequest,
  Subscription,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import type { BatchInitialState } from './batch';
import { BatchProcessor, buildBatchResponseBundle, processBatch } from './batch';
import type { FhirRequest } from './fhirrouter';
import { FhirRouter } from './fhirrouter';
import type { FhirRepository } from './repo';
import { MemoryRepository } from './repo';

const router: FhirRouter = new FhirRouter();
const repo: FhirRepository = new MemoryRepository();
const req: FhirRequest = {
  method: 'POST',
  url: '/',
  pathname: '',
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
      expect.fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(isOk(outcome)).toBe(false);
      expect(outcome.issue?.[0].details?.text).toStrictEqual('Unrecognized bundle type: undefined');
    }
  });

  test('Process batch with invalid bundle type', async () => {
    try {
      await processBatch(req, repo, router, { resourceType: 'Bundle', type: 'xyz' as unknown as 'batch' });
      expect.fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(isOk(outcome)).toBe(false);
      expect(outcome.issue?.[0].details?.text).toContain('Unrecognized bundle type');
    }
  });

  test('Process batch with missing entries', async () => {
    try {
      await processBatch(req, repo, router, { resourceType: 'Bundle', type: 'batch' });
      expect.fail('Expected error');
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
    expect(bundle.type).toStrictEqual('batch-response');
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toStrictEqual(5);
    expect(results[0].response?.status).toStrictEqual('201');
    expect(results[1].response?.status).toStrictEqual('201');
    expect(results[2].response?.status).toStrictEqual('200');
    expect(results[2].resource).toBeDefined();
    expect((results[2].resource as Bundle).entry?.length).toStrictEqual(1);
    expect(results[3].response?.status).toStrictEqual('404');
    expect(results[4].response?.status).toStrictEqual('404');

    const patient = await repo.readReference({
      reference: results[0].response?.location,
    });
    expect(patient).toBeDefined();

    const observation = await repo.readReference({
      reference: results[1].response?.location,
    });
    expect(observation).toBeDefined();
    expect((observation as Observation).subject?.reference).toStrictEqual('Patient/' + patient.id);
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('201');
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
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
    expect(bundle.entry?.[0]?.response?.status).toStrictEqual('400');
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('201');
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('201');

    const readResult = await repo.readReference({
      reference: results[0].response?.location,
    });
    expect(readResult).toBeDefined();
    expect((readResult as Patient).identifier?.[0]?.value).toStrictEqual(id);
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
    expect(results.length).toStrictEqual(2);
    expect(results[0].response?.status).toStrictEqual('201');
    expect(results[1].response?.status).toStrictEqual('200');
    expect(results[1].response?.location).toStrictEqual(results[0].response?.location);
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
    expect(results.length).toStrictEqual(3);
    expect(results[0].response?.status).toStrictEqual('201');
    expect(results[1].response?.status).toStrictEqual('201');
    expect(results[2].response?.status).toStrictEqual('412');
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
    expect(bundle.entry?.[0]?.response?.status).toStrictEqual('200');
    expect((bundle.entry?.[1]?.resource as ServiceRequest).requester?.reference).toStrictEqual(
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('200');
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
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
    expect(results.length).toStrictEqual(3);
    expect(results[0].response?.status).toStrictEqual('200');
    expect(results[1].response?.status).toStrictEqual('400');
    expect(results[1].response?.outcome?.issue?.[0]?.details?.text).toStrictEqual(
      'Decoded PATCH body must be an array'
    );
    expect(results[2].response?.status).toStrictEqual('400');
    expect(results[2].response?.outcome?.issue?.[0]?.details?.text).toStrictEqual(
      'Decoded PATCH body must be an array'
    );
  });

  test('Process batch patch Parameters', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      gender: 'unknown',
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
            resourceType: 'Parameters',
            parameter: [
              {
                name: 'operation',
                part: [
                  { name: 'op', valueCode: 'add' },
                  { name: 'path', valueString: '/name' },
                  { name: 'value', valueString: '[{"given":["Dave"],"family":"Smith"}]' },
                ],
              },
              {
                name: 'operation',
                part: [
                  { name: 'op', valueCode: 'copy' },
                  { name: 'from', valueString: '/name/0/family' },
                  { name: 'path', valueString: '/name/0/given/-' },
                ],
              },
              {
                name: 'operation',
                part: [
                  { name: 'op', valueCode: 'remove' },
                  { name: 'path', valueString: '/gender' },
                ],
              },
            ],
          },
        },
        {
          // Entry 2: Empty body (error)
          request: {
            method: 'PATCH',
            url: 'Patient/' + patient.id,
          },
          resource: {
            resourceType: 'Parameters',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toStrictEqual(2);
    expect(results[0].response?.status).toStrictEqual('200');
    const updatedPatient = results[0].resource as Patient;
    expect(updatedPatient.name?.[0]?.given).toStrictEqual(['Dave', 'Smith']);
    expect(updatedPatient.gender).toBeUndefined();
    expect(results[1].response?.status).toStrictEqual('400');
    expect(results[1].response?.outcome?.issue?.[0]?.details?.text).toStrictEqual(
      'Decoded PATCH body must be an array'
    );
  });

  test('Process batch FHIRPath patch', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      active: false,
    });

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: { method: 'PATCH', url: 'Patient/' + patient.id },
          resource: {
            resourceType: 'Parameters',
            parameter: [
              {
                name: 'operation',
                part: [
                  { name: 'type', valueCode: 'add' },
                  { name: 'path', valueString: 'Patient' },
                  { name: 'name', valueString: 'birthDate' },
                  { name: 'value', valueDate: '1990-05-15' },
                ],
              },
              {
                name: 'operation',
                part: [
                  { name: 'type', valueCode: 'replace' },
                  { name: 'path', valueString: 'Patient.active' },
                  { name: 'value', valueBoolean: true },
                ],
              },
            ],
          },
        },
      ],
    });

    const results = bundle.entry as BundleEntry[];
    expect(results).toHaveLength(1);
    expect(results[0].response?.status).toStrictEqual('200');
    const updated = results[0].resource as Patient;
    expect(updated.birthDate).toStrictEqual('1990-05-15');
    expect(updated.active).toStrictEqual(true);
  });

  test('Process batch FHIRPath patch rewrites local references', async () => {
    // A FHIRPath patch whose value is a Reference to a resource created
    // earlier in the same Bundle via a urn:uuid placeholder. The placeholder must be
    // rewritten to the real resource reference when the Parameters is passed through.
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const orgUrn = 'urn:uuid:' + randomUUID();

    const bundle = await processBatch(req, repo, router, {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: orgUrn,
          request: { method: 'POST', url: 'Organization' },
          resource: { resourceType: 'Organization', name: 'Acme' },
        },
        {
          request: { method: 'PATCH', url: 'Patient/' + patient.id },
          resource: {
            resourceType: 'Parameters',
            parameter: [
              {
                name: 'operation',
                part: [
                  { name: 'type', valueCode: 'add' },
                  { name: 'path', valueString: 'Patient' },
                  { name: 'name', valueString: 'managingOrganization' },
                  { name: 'value', valueReference: { reference: orgUrn } },
                ],
              },
            ],
          },
        },
      ],
    });

    const results = bundle.entry as BundleEntry[];
    expect(results).toHaveLength(2);
    expect(results[0].response?.status).toStrictEqual('201');
    const createdOrg = results[0].resource as Organization;
    expect(results[1].response?.status).toStrictEqual('200');
    const updated = results[1].resource as Patient;
    expect(updated.managingOrganization?.reference).toStrictEqual(getReferenceString(createdOrg));
  });

  describe('If-Match preconditions', () => {
    test('Batch FHIRPath PATCH with matching If-Match succeeds', async () => {
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient', active: false });
      const version = patient.meta?.versionId as string;
      expect(version).toBeDefined();

      const bundle = await processBatch(req, repo, router, {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            request: { method: 'PATCH', url: 'Patient/' + patient.id, ifMatch: `W/"${version}"` },
            resource: {
              resourceType: 'Parameters',
              parameter: [
                {
                  name: 'operation',
                  part: [
                    { name: 'type', valueCode: 'add' },
                    { name: 'path', valueString: 'Patient' },
                    { name: 'name', valueString: 'birthDate' },
                    { name: 'value', valueDate: '1990-05-15' },
                  ],
                },
              ],
            },
          },
        ],
      });

      const results = bundle.entry as BundleEntry[];
      expect(results[0].response?.status).toStrictEqual('200');
      expect((results[0].resource as Patient).birthDate).toStrictEqual('1990-05-15');
    });

    test('Batch FHIRPath PATCH with stale If-Match fails with 412', async () => {
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient', active: false });

      const bundle = await processBatch(req, repo, router, {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            request: { method: 'PATCH', url: 'Patient/' + patient.id, ifMatch: 'W/"stale-version"' },
            resource: {
              resourceType: 'Parameters',
              parameter: [
                {
                  name: 'operation',
                  part: [
                    { name: 'type', valueCode: 'add' },
                    { name: 'path', valueString: 'Patient' },
                    { name: 'name', valueString: 'birthDate' },
                    { name: 'value', valueDate: '1990-05-15' },
                  ],
                },
              ],
            },
          },
        ],
      });

      const results = bundle.entry as BundleEntry[];
      expect(results[0].response?.status).toStrictEqual('412');

      // The patch must NOT have been applied
      const unchanged = await repo.readResource<Patient>('Patient', patient.id);
      expect(unchanged.birthDate).toBeUndefined();
      expect(unchanged.meta?.versionId).toStrictEqual(patient.meta?.versionId);
    });

    test('Batch PUT with stale If-Match fails with 412', async () => {
      // Regression guard: If-Match already applies to update (PUT) entries
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient', active: false });

      const bundle = await processBatch(req, repo, router, {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            request: { method: 'PUT', url: 'Patient/' + patient.id, ifMatch: 'W/"stale-version"' },
            resource: { resourceType: 'Patient', id: patient.id, active: true },
          },
        ],
      });

      const results = bundle.entry as BundleEntry[];
      expect(results[0].response?.status).toStrictEqual('412');
      const unchanged = await repo.readResource<Patient>('Patient', patient.id);
      expect(unchanged.active).toStrictEqual(false);
    });

    test('Transaction PATCH with stale If-Match fails the whole transaction', async () => {
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient', active: false });

      await expect(
        processBatch(req, repo, router, {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            {
              request: { method: 'PATCH', url: 'Patient/' + patient.id, ifMatch: 'W/"stale-version"' },
              resource: {
                resourceType: 'Parameters',
                parameter: [
                  {
                    name: 'operation',
                    part: [
                      { name: 'type', valueCode: 'add' },
                      { name: 'path', valueString: 'Patient' },
                      { name: 'name', valueString: 'birthDate' },
                      { name: 'value', valueDate: '1990-05-15' },
                    ],
                  },
                ],
              },
            },
          ],
        })
      ).rejects.toThrow();
    });
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
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
            url: 'Patient/123/$everything',
          },
        },
      ],
    });
    expect(bundle).toBeDefined();
    expect(bundle.entry).toBeDefined();

    const results = bundle.entry as BundleEntry[];
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('404');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual('Not found');
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
      'Patch entry must include a Binary or Parameters resource'
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
      'Patch entry must include a Binary or Parameters resource'
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('200');
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('404');
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
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
    expect(bundle.entry?.[0]?.response?.status).toStrictEqual('404');
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
    expect(results.length).toStrictEqual(1);
    expect(results[0].response?.status).toStrictEqual('400');
    expect((results[0].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
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
    expect(results.length).toStrictEqual(3);
    for (const result of results) {
      expect(result.response?.status).toStrictEqual('404');
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
          fullUrl: 'urn:uuid:' + randomUUID(),
          request: {
            method: 'PUT',
            url: `Patient?identifier=${patientIdentifier}`,
          },
          resource: patient,
        },
        {
          fullUrl: 'urn:uuid:' + randomUUID(),
          request: {
            method: 'PUT',
            url: 'Patient?identifier=' + newIdentifier,
          },
          resource: { resourceType: 'Patient', identifier: [{ value: newIdentifier }] },
        },
        {
          fullUrl: 'urn:uuid:' + randomUUID(),
          request: {
            method: 'DELETE',
            url: 'Patient?identifier=' + randomUUID(),
          },
        },
      ],
    });
    expect(bundle.entry?.map((e) => e.response?.status)).toStrictEqual(['200', '201', '200']);
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
      expect(bundle.type).toStrictEqual('transaction-response');
      expect(bundle.entry).toBeDefined();

      const results = bundle.entry as BundleEntry[];
      expect(results.length).toStrictEqual(2);
      expect(results[0].response?.status).toStrictEqual('201');
      expect(results[1].response?.status).toStrictEqual('201');

      const subscription = await repo.readReference<Subscription>({
        reference: results[1].response?.location,
      });
      expect(subscription.criteria).toMatch(
        /QuestionnaireResponse\?questionnaire=Questionnaire\/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/
      );
    });

    test('Encoded urn:uuid', async () => {
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
              criteria: 'QuestionnaireResponse?questionnaire=urn%3Auuid%3Ae95d01cf-60ae-43f7-a8fc-0500a8b045bb',
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
      expect(bundle.type).toStrictEqual('transaction-response');
      expect(bundle.entry).toBeDefined();

      const results = bundle.entry as BundleEntry[];
      expect(results.length).toStrictEqual(2);
      expect(results[0].response?.status).toStrictEqual('201');
      expect(results[1].response?.status).toStrictEqual('201');

      const subscription = await repo.readReference<Subscription>({
        reference: results[1].response?.location,
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

  test('Local reference resolution for update', async () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:f1228716-b33c-420d-89ab-46fac9ebcc8b',
          request: {
            method: 'PUT',
            url: 'ServiceRequest/12345',
          },
          resource: {
            id: '12345',
            resourceType: 'ServiceRequest',
            intent: 'order',
            status: 'active',
            subject: { display: 'Test Patient' },
          },
        },
        {
          request: {
            method: 'POST',
            url: 'DiagnosticReport',
          },
          resource: {
            resourceType: 'DiagnosticReport',
            code: {},
            status: 'amended',
            basedOn: [{ reference: 'urn:uuid:f1228716-b33c-420d-89ab-46fac9ebcc8b' }],
          },
        },
      ],
    };
    const result = await processBatch(req, repo, router, bundle);
    const report = result.entry?.[1]?.resource as DiagnosticReport;
    expect(report.basedOn?.[0].reference).toStrictEqual('ServiceRequest/12345');
  });

  test('No self-assigned ID in upsert', async () => {
    const id = randomUUID();
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: { method: 'PUT', url: 'Patient?_id=' + id },
          resource: { resourceType: 'Patient', id },
        },
      ],
    };
    const result = await processBatch(req, repo, router, bundle);

    expect(result.entry?.[0]).toStrictEqual<BundleEntry>({
      response: expect.objectContaining({
        status: '400',
        outcome: badRequest('Cannot provide ID for create by update'),
      }),
      resource: undefined,
    });
  });

  describe('Re-entrant processing', () => {
    /**
     * Drives a batch bundle through the re-entrant BatchProcessor API, one entry at a time, the
     * way the async batch worker does. All durable state (initial state, progress marker, and
     * per-entry results) is round-tripped through JSON to simulate persistence to durable storage.
     * @param bundle - The batch bundle to process.
     * @param crashAfter - If set, simulate a crash + resume after this many entries have been
     *   processed, rehydrating a fresh processor via BatchProcessor.fromState.
     * @returns The assembled response bundle.
     */
    async function runReentrant(bundle: Bundle, crashAfter?: number): Promise<Bundle> {
      const results: Record<number, BundleEntry> = Object.create(null);
      const entryCount = bundle.entry?.length ?? 0;

      let processor = new BatchProcessor(router, repo, bundle, req);
      const initialState = await processor.preprocess();
      // Simulate persisting the initial state to durable storage and reloading it.
      const durableState: BatchInitialState = JSON.parse(JSON.stringify(initialState));
      Object.assign(results, durableState.preprocessResults);

      let processed = 0;
      let crashed = false;
      while (processor.hasMoreEntries()) {
        await processor.processNextEntry();
        // Checkpoint: persist newly produced results and the advanced progress marker.
        const pending = processor.takePendingResults();
        assert(pending);
        Object.assign(results, pending);
        processed++;

        if (crashAfter !== undefined && !crashed && processed === crashAfter && processor.hasMoreEntries()) {
          crashed = true;
          // Simulate a crash and resume: rehydrate a fresh processor from the durable state at the
          // last checkpointed position. Prior results live in `results` (durable storage).
          const position = processor.getPosition();
          processor = BatchProcessor.fromState(router, repo, req, JSON.parse(JSON.stringify(durableState)), position);
        }
      }

      return buildBatchResponseBundle(durableState.bundle.type, entryCount, results);
    }

    function makeReferenceBundle(): Bundle {
      const patientId = randomUUID();
      const observationId = randomUUID();
      return {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            fullUrl: 'urn:uuid:' + patientId,
            request: { method: 'POST', url: 'Patient' },
            resource: { resourceType: 'Patient', id: patientId },
          },
          {
            fullUrl: 'urn:uuid:' + observationId,
            request: { method: 'POST', url: 'Observation' },
            resource: {
              resourceType: 'Observation',
              status: 'final',
              id: observationId,
              subject: { reference: 'urn:uuid:' + patientId },
              code: { text: 'test' },
            },
          },
          { request: { method: 'GET', url: 'Patient?_count=1' } },
        ],
      };
    }

    test('Full run matches one-shot processBatch behavior', async () => {
      const oneShot = await processBatch(req, repo, router, makeReferenceBundle());
      const reentrant = await runReentrant(makeReferenceBundle());

      expect(reentrant.type).toStrictEqual('batch-response');
      expect(reentrant.entry).toHaveLength(3);
      expect(reentrant.entry?.map((e) => e.response?.status)).toStrictEqual(
        oneShot.entry?.map((e) => e.response?.status)
      );
      expect(reentrant.entry?.map((e) => e.response?.status)).toStrictEqual(['201', '201', '200']);
    });

    test('Placeholder references survive serialize -> fromState -> resume', async () => {
      // Crash + resume BEFORE the Observation (entry 1) is processed, so the reference rewrite
      // happens on the rehydrated processor using durably-persisted resolvedIdentities.
      const bundle = await runReentrant(makeReferenceBundle(), 1);

      const patientEntry = bundle.entry?.[0];
      const observationEntry = bundle.entry?.[1];
      expect(patientEntry?.response?.status).toStrictEqual('201');
      expect(observationEntry?.response?.status).toStrictEqual('201');

      const patientRef = patientEntry?.response?.location;
      expect(patientRef).toMatch(/^Patient\//);
      // The Observation's placeholder subject reference must resolve to the SAME patient that was
      // created during preprocessing, not a newly-generated id.
      expect((observationEntry?.resource as Observation)?.subject?.reference).toStrictEqual(patientRef);
    });

    test('Resume does not reprocess already-completed entries', async () => {
      const bundle = makeReferenceBundle();
      const processor = new BatchProcessor(router, repo, bundle, req);
      const initialState = await processor.preprocess();

      // Process the first entry, then take its results (checkpoint) and record the position.
      await processor.processNextEntry();
      const firstResults = processor.takePendingResults();
      assert(firstResults);
      expect(Object.keys(firstResults)).toHaveLength(1);
      const secondTake = processor.takePendingResults();
      expect(secondTake).toBeUndefined();
      const resumePosition = processor.getPosition();
      expect(resumePosition).toStrictEqual(1);

      // Rehydrate at the checkpointed position and finish. The resumed processor must only
      // produce results for the remaining entries, never re-producing the first entry.
      const resumed = BatchProcessor.fromState(router, repo, req, initialState, resumePosition);
      const producedIndices = new Set<number>();
      while (resumed.hasMoreEntries()) {
        await resumed.processNextEntry();
        const pending = resumed.takePendingResults();
        assert(pending);
        for (const index of Object.keys(pending)) {
          producedIndices.add(Number(index));
        }
      }
      const firstIndex = Number(Object.keys(firstResults)[0]);
      expect(producedIndices.has(firstIndex)).toBe(false);
      // The remaining two entries (indices 1 and 2) should have been produced by the resumed run.
      expect(resumed.getPosition()).toStrictEqual(3);
      expect(producedIndices).toStrictEqual(new Set([1, 2]));
    });

    test('processNextEntry before preprocess throws', async () => {
      const processor = new BatchProcessor(router, repo, makeReferenceBundle(), req);
      await expect(processor.processNextEntry()).rejects.toThrow('processNextEntry called before preprocess()');
    });

    test('Malformed entries are captured as preprocess results', async () => {
      const bundle = await runReentrant({
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          { request: { method: 'POST', url: 'Patient' }, resource: { resourceType: 'Patient' } },
          // Missing request method -> error result produced during preprocessing
          { resource: { resourceType: 'Patient' } },
        ],
      });
      expect(bundle.entry).toHaveLength(2);
      expect(bundle.entry?.[0]?.response?.status).toStrictEqual('201');
      expect(bundle.entry?.[1]?.response?.status).toStrictEqual('400');
    });
  });

  describe('Transaction resource type tracking', () => {
    test('Gathers resource types from transaction entries', async () => {
      // Pre-create resources so the patch/delete/read entries succeed within the transaction
      const serviceRequest = await repo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { display: 'Test' },
      });
      const observation = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
      });
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });

      const spy = vi.spyOn(repo, 'withTransaction');
      try {
        const bundle = await processBatch(req, repo, router, {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            {
              // create: type derived from the route (URL)
              request: { method: 'POST', url: 'Organization' },
              resource: { resourceType: 'Organization', name: 'Test Org' },
            },
            {
              // PATCH: type comes from the URL, NOT the Parameters payload
              request: { method: 'PATCH', url: 'ServiceRequest/' + serviceRequest.id },
              resource: {
                resourceType: 'Parameters',
                parameter: [
                  {
                    name: 'operation',
                    part: [
                      { name: 'op', valueCode: 'replace' },
                      { name: 'path', valueString: '/status' },
                      { name: 'value', valueString: '"completed"' },
                    ],
                  },
                ],
              },
            },
            {
              // DELETE: no entry.resource at all; type comes from the URL
              request: { method: 'DELETE', url: 'Observation/' + observation.id },
            },
            {
              // read: no entry.resource; type comes from the URL
              request: { method: 'GET', url: 'Patient/' + patient.id },
            },
          ],
        });

        expect(bundle.type).toStrictEqual('transaction-response');
        expect(spy).toHaveBeenCalledTimes(1);

        const { resourceTypes } = spy.mock.calls[0][1];
        expect(Array.from(resourceTypes).sort()).toStrictEqual([
          'Observation',
          'Organization',
          'Patient',
          'ServiceRequest',
        ]);
        // The PATCH target type is recorded, not the Binary/Parameters payload
        expect(Array.from(resourceTypes)).not.toContain('Parameters');
      } finally {
        spy.mockRestore();
      }
    });

    test('De-duplicates repeated resource types', async () => {
      const patient1 = await repo.createResource<Patient>({ resourceType: 'Patient' });
      const patient2 = await repo.createResource<Patient>({ resourceType: 'Patient' });

      const spy = vi.spyOn(repo, 'withTransaction');
      try {
        await processBatch(req, repo, router, {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            { request: { method: 'GET', url: 'Patient/' + patient1.id } },
            { request: { method: 'GET', url: 'Patient/' + patient2.id } },
            { request: { method: 'POST', url: 'Patient' }, resource: { resourceType: 'Patient' } },
          ],
        });

        const { resourceTypes } = spy.mock.calls[0][1];
        expect(Array.from(resourceTypes)).toStrictEqual(['Patient']);
      } finally {
        spy.mockRestore();
      }
    });

    test('Skips system-level entries with no resource type', async () => {
      const spy = vi.spyOn(repo, 'withTransaction');
      try {
        // search-system has no resourceType route param, so it is under-reported
        await processBatch(req, repo, router, {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [{ request: { method: 'GET', url: '?_type=Observation' } }],
        });

        const { resourceTypes } = spy.mock.calls[0][1];
        expect(Array.from(resourceTypes)).toStrictEqual([]);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
