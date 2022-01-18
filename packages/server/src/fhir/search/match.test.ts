import { Operator } from '@medplum/core';
import { matchesSearchRequest } from './match';

describe('Search matching', () => {
  test('Matches resource type', () => {
    expect(matchesSearchRequest({ resourceType: 'Observation' }, { resourceType: 'Observation' })).toBe(true);
    expect(matchesSearchRequest({ resourceType: 'Patient' }, { resourceType: 'Patient' })).toBe(true);
    expect(matchesSearchRequest({ resourceType: 'Observation' }, { resourceType: 'Patient' })).toBe(false);
    expect(matchesSearchRequest({ resourceType: 'Patient' }, { resourceType: 'Observation' })).toBe(false);
  });

  test('Unknown filter', () => {
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient' },
        { resourceType: 'Patient', filters: [{ code: 'unknown', operator: Operator.EQUALS, value: 'xyz' }] }
      )
    ).toBe(false);
  });

  test('Boolean filter', () => {
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: true },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.EQUALS, value: 'true' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: false },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.EQUALS, value: 'false' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: true },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.EQUALS, value: 'false' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: false },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.EQUALS, value: 'true' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: true },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.NOT_EQUALS, value: 'true' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: false },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.NOT_EQUALS, value: 'false' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: true },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.NOT_EQUALS, value: 'false' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', active: false },
        { resourceType: 'Patient', filters: [{ code: 'active', operator: Operator.NOT_EQUALS, value: 'true' }] }
      )
    ).toBe(true);
  });

  test('Reference filter', () => {
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', subject: { reference: 'Patient/123' } },
        { resourceType: 'Observation', filters: [{ code: 'subject', operator: Operator.EQUALS, value: 'Patient/123' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', subject: { reference: 'Patient/123' } },
        { resourceType: 'Observation', filters: [{ code: 'subject', operator: Operator.EQUALS, value: 'Patient/456' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', subject: { reference: 'Patient/123' } },
        {
          resourceType: 'Observation',
          filters: [{ code: 'subject', operator: Operator.NOT_EQUALS, value: 'Patient/123' }],
        }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', subject: { reference: 'Patient/123' } },
        {
          resourceType: 'Observation',
          filters: [{ code: 'subject', operator: Operator.NOT_EQUALS, value: 'Patient/456' }],
        }
      )
    ).toBe(true);
  });

  test('String equals', () => {
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', name: [{ given: ['Homer'], family: 'Simpson' }] },
        { resourceType: 'Patient', filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Simpson' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', name: [{ given: ['Homer'], family: 'Simpson' }] },
        { resourceType: 'Patient', filters: [{ code: 'name', operator: Operator.EQUALS, value: 'George' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', name: [{ given: ['Homer'], family: 'Simpson' }] },
        {
          resourceType: 'Patient',
          filters: [{ code: 'name', operator: Operator.NOT_EQUALS, value: 'Simpson' }],
        }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Patient', name: [{ given: ['Homer'], family: 'Simpson' }] },
        {
          resourceType: 'Patient',
          filters: [{ code: 'name', operator: Operator.NOT_EQUALS, value: 'George' }],
        }
      )
    ).toBe(true);
  });

  test('Token filter', () => {
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', code: { text: 'foo' } },
        { resourceType: 'Observation', filters: [{ code: 'code', operator: Operator.EQUALS, value: 'foo' }] }
      )
    ).toBe(true);
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', code: { text: 'foo' } },
        { resourceType: 'Observation', filters: [{ code: 'code', operator: Operator.EQUALS, value: 'George' }] }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', code: { text: 'foo' } },
        {
          resourceType: 'Observation',
          filters: [{ code: 'code', operator: Operator.NOT_EQUALS, value: 'foo' }],
        }
      )
    ).toBe(false);
    expect(
      matchesSearchRequest(
        { resourceType: 'Observation', code: { text: 'foo' } },
        {
          resourceType: 'Observation',
          filters: [{ code: 'code', operator: Operator.NOT_EQUALS, value: 'George' }],
        }
      )
    ).toBe(true);
  });
});
