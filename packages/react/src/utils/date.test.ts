import { Communication, Resource } from '@medplum/fhirtypes';
import { TimeSortable, sortByDateAndPriority, sortByDateAndPriorityGeneric } from './date';

describe('Date utils', () => {
  describe('sortByDateAndPriority()', () => {
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

    test('Ignore sorting special cases on timeline', () => {
      // When looking at a particular resource's timeline view,
      // history events for that resource should not use the sorting special cases
      const resourceType = 'Communication';
      const id = '1234';
      const input: Communication[] = [
        { resourceType, id, meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
        { resourceType, id, meta: { lastUpdated: '2001-01-02T00:00:00.000Z' }, sent: '2000-01-01T00:00:00.000Z' },
        { resourceType, id, meta: { lastUpdated: '2001-01-03T00:00:00.000Z' } },
        { resourceType, id, meta: { lastUpdated: '2001-01-04T00:00:00.000Z' }, priority: 'stat' },
        { resourceType, id, meta: { lastUpdated: '2001-01-05T00:00:00.000Z' }, priority: 'routine' },
      ];
      const expected: Communication[] = [
        { resourceType, id, meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
        { resourceType, id, meta: { lastUpdated: '2001-01-02T00:00:00.000Z' }, sent: '2000-01-01T00:00:00.000Z' },
        { resourceType, id, meta: { lastUpdated: '2001-01-03T00:00:00.000Z' } },
        { resourceType, id, meta: { lastUpdated: '2001-01-04T00:00:00.000Z' }, priority: 'stat' },
        { resourceType, id, meta: { lastUpdated: '2001-01-05T00:00:00.000Z' }, priority: 'routine' },
      ];
      sortByDateAndPriority(input, input[0]);
      expect(input).toMatchObject(expected);
    });
  });

  describe('sortByDateAndPriorityGeneric()', () => {
    test('Sort by date with generic `TimeSortable` and `Resource` items', () => {
      const input = [
        { resourceType: 'Patient', meta: { lastUpdated: '2003-03-03T00:00:00.000Z' } },
        { resourceType: 'Patient', meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
        { resourceType: 'Patient', meta: { lastUpdated: '2002-02-02T00:00:00.000Z' } },
        { resourceType: 'DocumentReference', date: '2008-08-08T00:00:00.000Z' },
        { time: '2010-04-04T00:00:00.000Z' },
        { resourceType: 'Observation', issued: '2007-07-07T00:00:00.000Z' },
        { resourceType: 'Media', issued: '2006-06-06T00:00:00.000Z' },
        { resourceType: 'DiagnosticReport', issued: '2005-05-05T00:00:00.000Z' },
        { resourceType: 'Communication', sent: '2004-04-04T00:00:00.000Z' },
        { time: '2005-04-04T00:00:00.000Z' },
      ] satisfies TimeSortable[];
      const expected = [
        { resourceType: 'Patient', meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
        { resourceType: 'Patient', meta: { lastUpdated: '2002-02-02T00:00:00.000Z' } },
        { resourceType: 'Patient', meta: { lastUpdated: '2003-03-03T00:00:00.000Z' } },
        { resourceType: 'Communication', sent: '2004-04-04T00:00:00.000Z' },
        { time: '2005-04-04T00:00:00.000Z' },
        { resourceType: 'DiagnosticReport', issued: '2005-05-05T00:00:00.000Z' },
        { resourceType: 'Media', issued: '2006-06-06T00:00:00.000Z' },
        { resourceType: 'Observation', issued: '2007-07-07T00:00:00.000Z' },
        { resourceType: 'DocumentReference', date: '2008-08-08T00:00:00.000Z' },
        { time: '2010-04-04T00:00:00.000Z' },
      ] satisfies TimeSortable[];
      sortByDateAndPriorityGeneric(input);
      expect(input).toMatchObject(expected);
    });

    test('Sort by date and priority with generic and `Resource` items', () => {
      const input = [
        { resourceType: 'Communication', meta: { lastUpdated: '2003-03-03T00:00:00.000Z' } },
        { resourceType: 'Communication', meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
        { resourceType: 'Communication', meta: { lastUpdated: '2002-02-02T00:00:00.000Z' } },
        { resourceType: 'Communication', meta: { lastUpdated: '2004-04-04T00:00:00.000Z' }, priority: 'stat' },
        { resourceType: 'Communication', meta: { lastUpdated: '2005-05-05T00:00:00.000Z' }, priority: 'routine' },
        { time: '2010-04-04T00:00:00.000Z' },
      ] satisfies TimeSortable[];
      const expected = [
        { resourceType: 'Communication', meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
        { resourceType: 'Communication', meta: { lastUpdated: '2002-02-02T00:00:00.000Z' } },
        { resourceType: 'Communication', meta: { lastUpdated: '2003-03-03T00:00:00.000Z' } },
        { resourceType: 'Communication', meta: { lastUpdated: '2005-05-05T00:00:00.000Z' }, priority: 'routine' },
        { time: '2010-04-04T00:00:00.000Z' },
        { resourceType: 'Communication', meta: { lastUpdated: '2004-04-04T00:00:00.000Z' }, priority: 'stat' },
      ] satisfies TimeSortable[];
      sortByDateAndPriorityGeneric(input);
      expect(input).toMatchObject(expected);
    });

    test('Ignore sorting special cases on timeline with generics', () => {
      // When looking at a particular resource's timeline view,
      // history events for that resource should not use the sorting special cases
      const resourceType = 'Communication';
      const id = '1234';
      const input = [
        { resourceType, id, meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
        { resourceType, id, meta: { lastUpdated: '2001-01-02T00:00:00.000Z' }, sent: '2000-01-01T00:00:00.000Z' },
        { resourceType, id, meta: { lastUpdated: '2001-01-03T00:00:00.000Z' } },
        { time: '2002-01-05T00:00:00.000Z' },
        { resourceType, id, meta: { lastUpdated: '2001-01-04T00:00:00.000Z' }, priority: 'stat' },
        { resourceType, id, meta: { lastUpdated: '2001-01-05T00:00:00.000Z' }, priority: 'routine' },
      ] satisfies TimeSortable[];
      const expected = [
        { resourceType, id, meta: { lastUpdated: '2001-01-01T00:00:00.000Z' } },
        { resourceType, id, meta: { lastUpdated: '2001-01-02T00:00:00.000Z' }, sent: '2000-01-01T00:00:00.000Z' },
        { resourceType, id, meta: { lastUpdated: '2001-01-03T00:00:00.000Z' } },
        { resourceType, id, meta: { lastUpdated: '2001-01-04T00:00:00.000Z' }, priority: 'stat' },
        { resourceType, id, meta: { lastUpdated: '2001-01-05T00:00:00.000Z' }, priority: 'routine' },
        { time: '2002-01-05T00:00:00.000Z' },
      ] satisfies TimeSortable[];
      sortByDateAndPriorityGeneric(input, input[0] as Communication);
      expect(input).toMatchObject(expected);
    });
  });
});
