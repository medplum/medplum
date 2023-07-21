import { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';
import { convertToTransactionBundle } from './bundle';

let jsonFile: any;
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

describe('convertToTransactionBundle', () => {
  test('reorders a 2-element bundle', () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        createResourceWithReference('DiagnosticReport', 'urn:uuid:B', { subject: { reference: 'urn:uuid:A' } }),
        createResourceWithReference('Patient', 'urn:uuid:A'),
      ],
    };

    const reorderedBundle = convertToTransactionBundle(inputBundle);

    expect(reorderedBundle?.entry?.map((e) => e.fullUrl)).toEqual(['urn:uuid:A', 'urn:uuid:B']);
  });

  test('reorders a bundle with a cycle', () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        createResourceWithReference('ServiceRequest', 'urn:uuid:A', { subject: { reference: 'urn:uuid:B' } }),
        createResourceWithReference('Specimen', 'urn:uuid:B', { request: [{ reference: 'urn:uuid:A' }] }),
      ],
    };

    const reorderedBundle = convertToTransactionBundle(inputBundle);

    expect(reorderedBundle?.entry?.map((e) => e.fullUrl)).toEqual(['urn:uuid:A', 'urn:uuid:B', 'urn:uuid:B']);
    expect(reorderedBundle?.entry?.map((e) => e.request?.method)).toEqual(['POST', 'POST', 'PUT']);
  });

  test('Reorders Lab bundle', () => {
    const inputBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        createResourceWithReference('Patient', 'urn:uuid:A'),
        createResourceWithReference('ServiceRequest', 'urn:uuid:B', { subject: { reference: 'urn:uuid:A' } }),
        createResourceWithReference('DiagnosticReport', 'urn:uuid:C', {
          subject: { reference: 'urn:uuid:A' },
          basedOn: [{ reference: 'urn:uuid:B' }],
          result: [{ reference: 'urn:uuid:D' }],
        }),
        createResourceWithReference('Observation', 'urn:uuid:D', {
          subject: { reference: 'urn:uuid:A' },
        }),
      ],
    };

    const reorderedBundle = convertToTransactionBundle(inputBundle);

    expect(reorderedBundle.entry?.map((e) => e.fullUrl)).toEqual([
      'urn:uuid:A',
      'urn:uuid:D',
      'urn:uuid:B',
      'urn:uuid:C',
    ]);
  });
});
