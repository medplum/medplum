import { createBundleFromEntry, getFHIRBundle } from './utils';

let jsonFile: any;
jest.mock('URL');
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
    const fhirBundle = createBundleFromEntry(jsonFile.entry);
    const jsonFhirBundle = JSON.parse(fhirBundle);
    const firstEntry = jsonFhirBundle.entry[0];
    expect(firstEntry.request.url).toEqual('Patient');
  });

  test('create a FHIR Bundle and download the file', () => {
    URL.createObjectURL = jest.fn(() => 'blob:http://localhost/blob');
    URL.revokeObjectURL = jest.fn();

    getFHIRBundle(jsonFile.entry);
  });
});
