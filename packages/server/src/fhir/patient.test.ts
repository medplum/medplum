import { Account, Observation, Patient, Reference } from '@medplum/fhirtypes';
import { getPatientCompartmentProperties, getPatientCompartmentResourceTypes, getPatientId } from './patient';

describe('FHIR Patient utils', () => {
  test('getPatientCompartmentProperties', () => {
    expect(getPatientCompartmentProperties('Observation')).toEqual(['subject', 'performer']);
    expect(getPatientCompartmentProperties('xxx')).toBeUndefined();
  });

  test('getPatientCompartmentResourceTypes', () => {
    const resourceTypes = getPatientCompartmentResourceTypes();
    expect(resourceTypes).toContain('Patient');
    expect(resourceTypes).toContain('Observation');
  });

  test('getPatientId', () => {
    expect(
      getPatientId({
        resourceType: 'Account',
        subject: [] as Reference[],
      } as Account)
    ).toBeUndefined();
    expect(getPatientId({ resourceType: 'Account', subject: [{}] } as Account)).toBeUndefined();
    expect(
      getPatientId({
        resourceType: 'Account',
        subject: [{ reference: 'Device/123' }],
      } as Account)
    ).toBeUndefined();
    expect(
      getPatientId({
        resourceType: 'Account',
        subject: [{ reference: 'Patient/123' }],
      } as Account)
    ).toBe('123');

    expect(getPatientId({ resourceType: 'Observation' } as Observation)).toBeUndefined();
    expect(
      getPatientId({
        resourceType: 'Observation',
        subject: undefined,
      } as Observation)
    ).toBeUndefined();
    expect(
      getPatientId({
        resourceType: 'Observation',
        subject: null,
      } as unknown as Observation)
    ).toBeUndefined();
    expect(getPatientId({ resourceType: 'Observation', subject: {} } as Observation)).toBeUndefined();
    expect(
      getPatientId({
        resourceType: 'Observation',
        subject: { reference: 'Device/123' },
      } as Observation)
    ).toBeUndefined();
    expect(
      getPatientId({
        resourceType: 'Observation',
        subject: { reference: 'Patient/123' },
      } as Observation)
    ).toBe('123');

    expect(getPatientId({ resourceType: 'Patient' } as Patient)).toBeUndefined();
    expect(getPatientId({ resourceType: 'Patient', id: undefined } as Patient)).toBeUndefined();
    expect(getPatientId({ resourceType: 'Patient', id: null } as unknown as Patient)).toBeNull();
    expect(getPatientId({ resourceType: 'Patient', id: '123' } as Patient)).toBe('123');
  });
});
