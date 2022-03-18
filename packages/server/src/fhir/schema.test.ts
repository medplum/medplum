import { Patient, Questionnaire, Resource } from '@medplum/fhirtypes';
import { validateResource, validateResourceType } from './schema';

describe('FHIR schema', () => {
  test('validateResourceType', () => {
    expect(validateResourceType('').issue?.[0]?.severity).toEqual('error');
    expect(validateResourceType('FakeResource').issue?.[0]?.severity).toEqual('error');
    expect(validateResourceType('Patient').id).toEqual('ok');
  });

  test('validateResource', () => {
    expect(validateResource(null as unknown as Resource).issue?.[0]?.severity).toEqual('error');
    expect(validateResource({} as unknown as Resource).issue?.[0]?.severity).toEqual('error');
    expect(validateResource({ resourceType: 'FakeResource' } as unknown as Resource).issue?.[0]?.severity).toEqual(
      'error'
    );
    expect(validateResource({ resourceType: 'Patient' }).id).toEqual('ok');
  });

  test('Array properties', () => {
    expect(
      validateResource({
        resourceType: 'Patient',
        name: [{ given: ['Homer'] }],
      }).id
    ).toEqual('ok');

    const outcome = validateResource({
      resourceType: 'Patient',
      name: 'Homer',
    } as unknown as Resource);
    expect(outcome.issue?.[0]?.severity).toEqual('error');
    expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name');
  });

  test('Additional properties', () => {
    expect(
      validateResource({
        resourceType: 'Patient',
        name: [{ given: ['Homer'] }],
        meta: {},
      }).id
    ).toEqual('ok');

    const outcome = validateResource({
      resourceType: 'Patient',
      fakeProperty: 'test',
    } as unknown as Resource);
    expect(outcome.issue?.[0]?.severity).toEqual('error');
    expect(outcome.issue?.[0]?.expression?.[0]).toEqual('fakeProperty');
  });

  test('Required properties', () => {
    const outcome = validateResource({ resourceType: 'DiagnosticReport' });
    expect(outcome.issue?.[0]?.severity).toEqual('error');
    expect(outcome.issue?.[0]?.expression?.[0]).toEqual('code');
  });

  test('Null value', () => {
    const outcome = validateResource({
      resourceType: 'Patient',
      name: null,
    } as unknown as Patient);
    expect(outcome.issue?.[0]?.severity).toEqual('error');
    expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name');
  });

  test('Null array element', () => {
    const outcome = validateResource({
      resourceType: 'Patient',
      name: [null],
    } as unknown as Patient);
    expect(outcome.issue?.[0]?.severity).toEqual('error');
    expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name[0]');
  });

  test('Nested null array element', () => {
    const outcome = validateResource({
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
    expect(outcome.issue?.length).toBe(2);
    expect(outcome.issue?.[0]?.severity).toEqual('error');
    expect(outcome.issue?.[0]?.expression?.[0]).toEqual('identifier[0].system');
    expect(outcome.issue?.[1]?.severity).toEqual('error');
    expect(outcome.issue?.[1]?.expression?.[0]).toEqual('name[1].given[1]');
  });

  test('Deep nested null array element', () => {
    const outcome = validateResource({
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
    expect(outcome.issue?.[0]?.severity).toEqual('error');
    expect(outcome.issue?.[0]?.expression?.[0]).toEqual('item[0].item[0].item[0].item[0].item');
  });
});
