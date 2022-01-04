import { Resource } from '@medplum/fhirtypes';
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
});
