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
        createResourceWithReference('DiagnosticReport', 'urn:uuid:3d8b6e96-6de4-48c1-b7ff-e2c26c924620', {
          subject: { reference: 'urn:uuid:70653c8f-95e1-4b4e-84e8-8d64c15e4a13' },
        }),
        createResourceWithReference('Patient', 'urn:uuid:70653c8f-95e1-4b4e-84e8-8d64c15e4a13'),
      ],
    };

    const reorderedBundle = convertToTransactionBundle(inputBundle);

    expect(reorderedBundle?.entry?.map((e) => e.fullUrl)).toEqual([
      'urn:uuid:70653c8f-95e1-4b4e-84e8-8d64c15e4a13',
      'urn:uuid:3d8b6e96-6de4-48c1-b7ff-e2c26c924620',
    ]);
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

    expect(reorderedBundle?.entry?.map((e) => e.fullUrl)).toEqual([
      'urn:uuid:c3d8f926-1f10-41b5-bd20-1d3d6e1f63b5',
      'urn:uuid:b3e7d3f5-f7c0-41c3-b1c2-8b39e271b2c8',
      'urn:uuid:c3d8f926-1f10-41b5-bd20-1d3d6e1f63b5',
      'urn:uuid:b3e7d3f5-f7c0-41c3-b1c2-8b39e271b2c8',
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

    expect(reorderedBundle.entry?.map((e) => e.fullUrl)).toEqual([
      'urn:uuid:ca760a2b-3f5d-4c85-9087-b8b6422970a8',
      'urn:uuid:e2d7f292-1e1d-4d5c-9f3a-fae792856f71',
      'urn:uuid:76cdff91-2a4d-4c57-8922-2f2ea17f6756',
      'urn:uuid:9e1fe992-1e45-4a0e-8dae-cbb8490f449e',
    ]);
  });
});
