import { getPropertyDisplayName } from './types';

describe('Type Utils', () => {
  test('getPropertyDisplayName', () => {
    expect(getPropertyDisplayName({ path: 'Patient.name' })).toEqual('Name');
    expect(getPropertyDisplayName({ path: 'Patient.birthDate' })).toEqual('Birth Date');
    expect(getPropertyDisplayName({ path: 'DeviceDefinition.manufacturer[x]' })).toEqual('Manufacturer');
  });
});
