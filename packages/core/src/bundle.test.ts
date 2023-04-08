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
    const firstEntry = transactionBundle?.entry?.[0];
    expect(firstEntry?.request?.url).toEqual('Patient');
  });
});
