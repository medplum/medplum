import { exportJsonFile, partition } from './utils';

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

    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

interface SpecialThing {
  type: 'special';
}

function isSpecialThing(obj: any): obj is SpecialThing {
  if (!obj) {
    return false;
  }

  return obj.type === 'special';
}

describe('partition', () => {
  test('correctly partitions based on predicate', () => {
    const notSpecialThings = [undefined, null, Object.create(null), { name: 'not-special' }];

    const specialThings = [
      { name: 'special1', type: 'special' },
      { name: 'special2', type: 'special' },
    ];
    const allThings: any[] = [...notSpecialThings, ...specialThings];

    const results = partition(allThings, isSpecialThing);
    const specialOutput: SpecialThing[] = results[0];
    const anyOutput: any[] = results[1];

    expect(specialOutput.length).toEqual(specialThings.length);
    expect(specialOutput).toEqual(expect.arrayContaining(specialThings));

    expect(anyOutput.length).toEqual(notSpecialThings.length);
    expect(anyOutput).toEqual(expect.arrayContaining(notSpecialThings));
  });
});
