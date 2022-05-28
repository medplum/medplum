import { Communication, Resource } from '@medplum/fhirtypes';
import { sortByDateAndPriority } from './date';

describe('Date utils', () => {
  test('Sort by date', () => {
    const input: Resource[] = [
      { resourceType: 'Patient', meta: { lastUpdated: '2003-03-03T00:00:00.000Z' } },
      { resourceType: 'Patient', meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
      { resourceType: 'Patient', meta: { lastUpdated: '2002-02-02T00:00:00.000Z' } },
      { resourceType: 'DocumentReference', date: '2008-08-08T00:00:00.000Z' },
      { resourceType: 'Observation', issued: '2007-07-07T00:00:00.000Z' },
      { resourceType: 'Media', issued: '2006-06-06T00:00:00.000Z' },
      { resourceType: 'DiagnosticReport', issued: '2005-05-05T00:00:00.000Z' },
      { resourceType: 'Communication', sent: '2004-04-04T00:00:00.000Z' },
    ];
    const expected: Resource[] = [
      { resourceType: 'Patient', meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
      { resourceType: 'Patient', meta: { lastUpdated: '2002-02-02T00:00:00.000Z' } },
      { resourceType: 'Patient', meta: { lastUpdated: '2003-03-03T00:00:00.000Z' } },
      { resourceType: 'Communication', sent: '2004-04-04T00:00:00.000Z' },
      { resourceType: 'DiagnosticReport', issued: '2005-05-05T00:00:00.000Z' },
      { resourceType: 'Media', issued: '2006-06-06T00:00:00.000Z' },
      { resourceType: 'Observation', issued: '2007-07-07T00:00:00.000Z' },
      { resourceType: 'DocumentReference', date: '2008-08-08T00:00:00.000Z' },
    ];
    sortByDateAndPriority(input);
    expect(input).toMatchObject(expected);
  });

  test('Sort by date and priority', () => {
    const input: Communication[] = [
      { resourceType: 'Communication', meta: { lastUpdated: '2003-03-03T00:00:00.000Z' } },
      { resourceType: 'Communication', meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
      { resourceType: 'Communication', meta: { lastUpdated: '2002-02-02T00:00:00.000Z' } },
      { resourceType: 'Communication', meta: { lastUpdated: '2004-04-04T00:00:00.000Z' }, priority: 'stat' },
      { resourceType: 'Communication', meta: { lastUpdated: '2005-05-05T00:00:00.000Z' }, priority: 'routine' },
    ];
    const expected: Communication[] = [
      { resourceType: 'Communication', meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
      { resourceType: 'Communication', meta: { lastUpdated: '2002-02-02T00:00:00.000Z' } },
      { resourceType: 'Communication', meta: { lastUpdated: '2003-03-03T00:00:00.000Z' } },
      { resourceType: 'Communication', meta: { lastUpdated: '2005-05-05T00:00:00.000Z' }, priority: 'routine' },
      { resourceType: 'Communication', meta: { lastUpdated: '2004-04-04T00:00:00.000Z' }, priority: 'stat' },
    ];
    sortByDateAndPriority(input);
    expect(input).toMatchObject(expected);
  });
});
