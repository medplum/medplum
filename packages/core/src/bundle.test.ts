import { Bundle, BundleEntry, DiagnosticReport, Patient, Resource, Specimen } from '@medplum/fhirtypes';
import { convertContainedResourcesToBundle, convertToTransactionBundle } from './bundle';
import { getDataType } from './typeschema/types';
import { deepClone, isUUID } from './utils';

let jsonFile: any;

function createResourceWithReference<T extends Resource>(
  resourceType: T['resourceType'],
  fullUrl: string,
  referenceField?: Partial<T>
): BundleEntry {
  let resource = { resourceType, id: fullUrl.split(':').pop() } as T;
  if (referenceField) {
    resource = { ...resource, ...referenceField };
  }

  return {
    fullUrl,
    resource,
    request: { method: 'POST', url: resourceType },
  };
}

describe('Bundle tests', () => {
  beforeEach(() => {
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.0);
  });

  afterEach(() => {
    jest.spyOn(global.Math, 'random').mockRestore();
  });

  describe('FHIR Bundle Download', () => {
    beforeEach(() => {
      jsonFile = {
        entry: [
          {
            fullUrl: 'medplum.com',
            resource: {
              meta: {},
              id: '123',
              resourceType: 'Patient',
            },
          },
          {
            fullUrl: 'app.medplum.com/123',
            resource: {
              meta: {
                id: '123',
              },
              id: '456',
              resourceType: 'Patient',
            },
          },
        ],
      };
    });

    test('create a FHIR bundle from JSON File', () => {
      const transactionBundle = convertToTransactionBundle(jsonFile);
      const firstEntry = transactionBundle.entry?.[0];
      expect(firstEntry?.request?.url).toEqual('Patient');
    });
  });

  describe('convertToTransactionBundle', () => {
    test('reorders a 2-element bundle', () => {
      const inputBundle: Bundle = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          createResourceWithReference('DiagnosticReport', 'urn:uuid:3d8b6e96-6de4-48c1-b7ff-e2c26c924620', {
            subject: { reference: 'urn:uuid:70653c8f-95e1-4b4e-84e8-8d64c15e4a13' },
          }),
          createResourceWithReference('Patient', 'urn:uuid:70653c8f-95e1-4b4e-84e8-8d64c15e4a13'),
        ],
      };

      const reorderedBundle = convertToTransactionBundle(inputBundle);

      expect(reorderedBundle?.entry?.map((e) => e.resource?.resourceType)).toEqual(['Patient', 'DiagnosticReport']);
    });

    test('reorders a bundle with a cycle', () => {
      const inputBundle: Bundle = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          createResourceWithReference('ServiceRequest', 'urn:uuid:c3d8f926-1f10-41b5-bd20-1d3d6e1f63b5', {
            subject: { reference: 'urn:uuid:b3e7d3f5-f7c0-41c3-b1c2-8b39e271b2c8' },
          }),
          createResourceWithReference('Specimen', 'urn:uuid:b3e7d3f5-f7c0-41c3-b1c2-8b39e271b2c8', {
            request: [{ reference: 'urn:uuid:c3d8f926-1f10-41b5-bd20-1d3d6e1f63b5' }],
          }),
        ],
      };

      const reorderedBundle = convertToTransactionBundle(inputBundle);

      expect(reorderedBundle?.entry?.map((e) => e.resource?.resourceType)).toEqual([
        'ServiceRequest',
        'Specimen',
        'ServiceRequest',
        'Specimen',
      ]);
      expect(reorderedBundle?.entry?.map((e) => e.request?.method)).toEqual(['POST', 'POST', 'PUT', 'PUT']);
    });

    test('Reorders Lab bundle', () => {
      const inputBundle: Bundle = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          createResourceWithReference('Patient', 'urn:uuid:ca760a2b-3f5d-4c85-9087-b8b6422970a8'),
          createResourceWithReference('ServiceRequest', 'urn:uuid:76cdff91-2a4d-4c57-8922-2f2ea17f6756', {
            subject: { reference: 'urn:uuid:ca760a2b-3f5d-4c85-9087-b8b6422970a8' },
          }),
          createResourceWithReference('DiagnosticReport', 'urn:uuid:9e1fe992-1e45-4a0e-8dae-cbb8490f449e', {
            subject: { reference: 'urn:uuid:ca760a2b-3f5d-4c85-9087-b8b6422970a8' },
            basedOn: [{ reference: 'urn:uuid:76cdff91-2a4d-4c57-8922-2f2ea17f6756' }],
            result: [{ reference: 'urn:uuid:e2d7f292-1e1d-4d5c-9f3a-fae792856f71' }],
          }),
          createResourceWithReference('Observation', 'urn:uuid:e2d7f292-1e1d-4d5c-9f3a-fae792856f71', {
            subject: { reference: 'urn:uuid:ca760a2b-3f5d-4c85-9087-b8b6422970a8' },
          }),
        ],
      };

      const reorderedBundle = convertToTransactionBundle(inputBundle);

      expect(reorderedBundle.entry?.map((e) => e.resource?.resourceType)).toEqual([
        'Patient',
        'Observation',
        'ServiceRequest',
        'DiagnosticReport',
      ]);
    });

    test('Cancer Pathology Example', () => {
      const bundle: Bundle = {
        resourceType: 'Bundle',
        id: 'us-pathology-content-bundle-example',
        type: 'collection',
        entry: [
          {
            fullUrl: 'http://hl7.org/fhir/us/cancer-reporting/Specimen/adrenal-example',
            resource: {
              resourceType: 'Specimen',
              id: 'adrenal-example',
              subject: { reference: 'Patient/JoelAlexPatient' },
            },
          },
          {
            fullUrl: 'http://hl7.org/fhir/us/cancer-reporting/Patient/JoelAlexPatient',
            resource: {
              resourceType: 'Patient',
              id: 'JoelAlexPatient',
              name: [
                {
                  family: 'Joel',
                  given: ['Alex'],
                },
              ],
              gender: 'male',
            },
          },
        ],
      };

      const transaction = convertToTransactionBundle(bundle);
      expect(transaction.entry?.map((e) => e.resource?.resourceType)).toMatchObject(['Patient', 'Specimen']);

      const specimen = transaction.entry?.find((e) => e.resource?.resourceType === 'Specimen')?.resource as Specimen;
      expect(isUUID(specimen?.subject?.reference?.split(':')[2] ?? '')).toBeTruthy();
    });

    test('Ignore unrecognized references', () => {
      const inputBundle: Bundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            fullUrl: 'https://example.com/Specimen/xyz',
            resource: {
              resourceType: 'Specimen',
              subject: { reference: 'Patient/xyz' },
            },
          },
        ],
      };

      const result = convertToTransactionBundle(inputBundle);
      expect(result).toMatchObject({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            resource: {
              resourceType: 'Specimen',
              subject: { reference: 'Patient/xyz' },
            },
          },
        ],
      });
    });

    test('Preserve resource.meta', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        meta: {
          account: {
            reference: 'Organization/33333333-3333-3333-3333-333333333333',
            display: 'Organization #3',
          },
          author: {
            reference: 'Practitioner/22222222-2222-2222-2222-222222222222',
            display: 'Doctor',
          },
          onBehalfOf: {
            reference: 'Practitioner/22222222-2222-2222-2222-222222222222',
            display: 'Doctor',
          },
          compartment: [
            {
              reference: 'Project/11111111-2222-3333-4444-555555555555',
            },
            {
              reference: 'Patient/00000000-0000-0000-0000-000000000000',
            },
          ],
          extension: [{ url: 'https://example.com/Extension/meta-1', valueBoolean: true }],
          id: 'some-id',
          lastUpdated: '2024-02-14T21:47:11.777Z',
          profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
          project: '11111111-2222-3333-4444-555555555555',
          security: [{ system: 'http://hl7.org/fhir/v3/Confidentiality', code: 'N' }],
          source: 'https://example.com/source',
          tag: [{ system: 'http://hl7.org/fhir/v3/ObservationValue', code: 'SUBSETTED' }],
          versionId: '55555555-5555-5555-5555-555555555555',
        },
        active: true,
      };

      const expected = deepClone(patient);
      const meta = expected.meta;
      if (meta === undefined) {
        fail('Expected meta to be defined');
      }

      const removedKeys = ['project', 'versionId', 'lastUpdated', 'compartment', 'author'];
      for (const key of Object.keys(getDataType('Meta').elements)) {
        // make sure every possible element is defined in the test
        expect((meta as any)[key]).toBeDefined();

        if (removedKeys.includes(key)) {
          delete (meta as any)[key];
        }
      }

      const inputBundle: Bundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            fullUrl: 'https://example.com/Patient/00000000-0000-0000-0000-000000000000',
            resource: patient,
          },
        ],
      };

      const result = convertToTransactionBundle(inputBundle);
      expect(result?.entry?.[0]?.resource).toEqual(expected);
    });
  });

  describe('convertContainedResourcesToBundle', () => {
    test('Simple resource', () => {
      const input: Patient = { resourceType: 'Patient' };
      const result = convertContainedResourcesToBundle(input);
      expect(result).toMatchObject({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            fullUrl: expect.stringMatching(/^urn:uuid:[a-f0-9-]{36}$/),
            request: { method: 'POST', url: 'Patient' },
            resource: {
              resourceType: 'Patient',
            },
          },
        ],
      });
    });

    test('Contained observations', () => {
      const input: DiagnosticReport = {
        resourceType: 'DiagnosticReport',
        status: 'final',
        code: { text: 'test' },
        contained: [
          {
            resourceType: 'Observation',
            id: '123',
            status: 'final',
            code: { text: 'test' },
            hasMember: [{ reference: '#456' }],
          },
          {
            resourceType: 'Observation',
            id: '456',
            status: 'final',
            code: { text: 'test' },
          },
        ],
        result: [{ reference: '#123' }],
      };

      const result = convertContainedResourcesToBundle(input);
      expect(result).toMatchObject({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            fullUrl: expect.stringMatching(/^urn:uuid:[a-f0-9-]{36}$/),
            request: { method: 'POST', url: 'Observation' },
            resource: {
              resourceType: 'Observation',
            },
          },
          {
            fullUrl: expect.stringMatching(/^urn:uuid:[a-f0-9-]{36}$/),
            request: { method: 'POST', url: 'Observation' },
            resource: {
              resourceType: 'Observation',
              hasMember: [
                {
                  reference: expect.stringMatching(/^urn:uuid:[a-f0-9-]{36}$/),
                },
              ],
            },
          },
          {
            fullUrl: expect.stringMatching(/^urn:uuid:[a-f0-9-]{36}$/),
            request: { method: 'POST', url: 'DiagnosticReport' },
            resource: {
              resourceType: 'DiagnosticReport',
              result: [
                {
                  reference: expect.stringMatching(/^urn:uuid:[a-f0-9-]{36}$/),
                },
              ],
            },
          },
        ],
      });
    });
  });
});
