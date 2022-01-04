import { Patient, Resource } from '@medplum/fhirtypes';
import { sortByDate } from './date';

describe('Date utils', () => {
  test('Sort by date', () => {
    const input: Patient[] = [
      {
        resourceType: 'Patient',
        meta: {
          lastUpdated: '2003-03-03T00:00:00.000Z',
        },
      },
      {
        resourceType: 'Patient',
        meta: {
          lastUpdated: '2001-01-01T00:00:00.000Z',
        },
      },
      {
        resourceType: 'Patient',
        meta: {
          lastUpdated: '2002-02-02T00:00:00.000Z',
        },
      },
    ];
    const expected: Resource[] = [
      {
        resourceType: 'Patient',
        meta: {
          lastUpdated: '2001-01-01T00:00:00.000Z',
        },
      },
      {
        resourceType: 'Patient',
        meta: {
          lastUpdated: '2002-02-02T00:00:00.000Z',
        },
      },
      {
        resourceType: 'Patient',
        meta: {
          lastUpdated: '2003-03-03T00:00:00.000Z',
        },
      },
    ];
    sortByDate(input);
    expect(input).toMatchObject(expected);
  });
});
