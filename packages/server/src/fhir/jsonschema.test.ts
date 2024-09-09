import { OperationOutcomeError } from '@medplum/core';
import { DiagnosticReport, Patient, Questionnaire, Resource } from '@medplum/fhirtypes';
import { validateResourceWithJsonSchema } from './jsonschema';

describe('FHIR JSONSchema', () => {
  test('validateResourceWithJsonSchema', () => {
    expect(() => validateResourceWithJsonSchema(null as unknown as Resource)).toThrow();
    expect(() => validateResourceWithJsonSchema({} as unknown as Resource)).toThrow();
    expect(() => validateResourceWithJsonSchema({ resourceType: 'FakeResource' } as unknown as Resource)).toThrow();
    expect(() => validateResourceWithJsonSchema({ resourceType: 'Patient' })).not.toThrow();
  });

  test('Array properties', () => {
    expect(() =>
      validateResourceWithJsonSchema({ resourceType: 'Patient', name: [{ given: ['Homer'] }] })
    ).not.toThrow();

    try {
      validateResourceWithJsonSchema({ resourceType: 'Patient', name: 'Homer' } as unknown as Resource);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name');
    }
  });

  test('Additional properties', () => {
    expect(() =>
      validateResourceWithJsonSchema({ resourceType: 'Patient', name: [{ given: ['Homer'] }], meta: {} })
    ).not.toThrow();

    try {
      validateResourceWithJsonSchema({ resourceType: 'Patient', fakeProperty: 'test' } as unknown as Resource);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('fakeProperty');
    }
  });

  test('Required properties', () => {
    try {
      validateResourceWithJsonSchema({ resourceType: 'DiagnosticReport' } as DiagnosticReport);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('code');
    }
  });

  test('Null value', () => {
    try {
      validateResourceWithJsonSchema({ resourceType: 'Patient', name: null } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name');
    }
  });

  test('Null array element', () => {
    try {
      validateResourceWithJsonSchema({ resourceType: 'Patient', name: [null] } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name[0]');
    }
  });

  test('Undefined array element', () => {
    try {
      validateResourceWithJsonSchema({ resourceType: 'Patient', name: [{ given: [undefined] }] } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name[0].given[0]');
    }
  });

  test('Nested null array element', () => {
    try {
      validateResourceWithJsonSchema({
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
      validateResourceWithJsonSchema({
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
