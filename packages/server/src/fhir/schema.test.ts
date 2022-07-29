import { OperationOutcomeError } from '@medplum/core';
import { Patient, Questionnaire, Resource } from '@medplum/fhirtypes';
import { validateResource, validateResourceType } from './schema';

describe('FHIR schema', () => {
  test('validateResourceType', () => {
    expect(() => validateResourceType('')).toThrow();
    expect(() => validateResourceType('FakeResource')).toThrow();
    expect(() => validateResourceType('Patient')).not.toThrow();
  });

  test('validateResource', () => {
    expect(() => validateResource(null as unknown as Resource)).toThrow();
    expect(() => validateResource({} as unknown as Resource)).toThrow();
    expect(() => validateResource({ resourceType: 'FakeResource' } as unknown as Resource)).toThrow();
    expect(() => validateResource({ resourceType: 'Patient' })).not.toThrow();
  });

  test('Array properties', () => {
    expect(() => validateResource({ resourceType: 'Patient', name: [{ given: ['Homer'] }] })).not.toThrow();

    try {
      validateResource({ resourceType: 'Patient', name: 'Homer' } as unknown as Resource);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name');
    }
  });

  test('Additional properties', () => {
    expect(() => validateResource({ resourceType: 'Patient', name: [{ given: ['Homer'] }], meta: {} })).not.toThrow();

    try {
      validateResource({ resourceType: 'Patient', fakeProperty: 'test' } as unknown as Resource);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('fakeProperty');
    }
  });

  test('Required properties', () => {
    try {
      validateResource({ resourceType: 'DiagnosticReport' });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('code');
    }
  });

  test('Null value', () => {
    try {
      validateResource({ resourceType: 'Patient', name: null } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name');
    }
  });

  test('Null array element', () => {
    try {
      validateResource({ resourceType: 'Patient', name: [null] } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name[0]');
    }
  });

  test('Nested null array element', () => {
    try {
      validateResource({
        resourceType: 'Patient',
        identifier: [
          {
            system: null,
          },
        ],
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
          {
            given: ['Alice', null],
            family: 'Smith',
          },
        ],
      } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.length).toBe(2);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('identifier[0].system');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.expression?.[0]).toEqual('name[1].given[1]');
    }
  });

  test('Deep nested null array element', () => {
    try {
      validateResource({
        resourceType: 'Questionnaire',
        item: [
          {
            item: [
              {
                item: [
                  {
                    item: [
                      {
                        item: null,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      } as unknown as Questionnaire);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('item[0].item[0].item[0].item[0].item');
    }
  });
});
