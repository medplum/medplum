import { exportJsonFile } from './utils';

let jsonFile: any;
describe('JSON File Download', () => {
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

  test('download a JSON file', () => {
    URL.createObjectURL = jest.fn(() => 'blob:http://localhost/blob');
    URL.revokeObjectURL = jest.fn();

    exportJsonFile(jsonFile.entry);

    expect(URL.revokeObjectURL).toBeCalled();
  });
});
