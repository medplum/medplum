import { Account, CarePlan, Observation, Patient, Reference } from '@medplum/fhirtypes';
import { getPatientCompartmentParams, getPatient } from './patient';

describe('FHIR Patient utils', () => {
  test('getPatientCompartmentParams', () => {
    expect(getPatientCompartmentParams('Observation')).toEqual(['subject', 'performer']);
    expect(getPatientCompartmentParams('xxx')).toBeUndefined();
  });

  test('getPatient', () => {
    expect(
      getPatient({
        resourceType: 'Account',
        subject: [] as Reference[],
      } as Account)
    ).toBeUndefined();
    expect(getPatient({ resourceType: 'Account', subject: [{}] } as Account)).toBeUndefined();
    expect(
      getPatient({
        resourceType: 'Account',
        subject: [{ reference: 'Device/123' }],
      } as Account)
    ).toBeUndefined();
    expect(
      getPatient({
        resourceType: 'Account',
        subject: [{ reference: 'Patient/123' }],
      } as Account)
    ).toMatchObject({ reference: 'Patient/123' });

    expect(getPatient({ resourceType: 'Observation' } as Observation)).toBeUndefined();
    expect(
      getPatient({
        resourceType: 'Observation',
        subject: undefined,
      } as Observation)
    ).toBeUndefined();
    expect(
      getPatient({
        resourceType: 'Observation',
        subject: 'bad',
      } as Observation)
    ).toBeUndefined();
    expect(
      getPatient({
        resourceType: 'Observation',
        subject: null,
      } as unknown as Observation)
    ).toBeUndefined();
    expect(getPatient({ resourceType: 'Observation', subject: {} } as Observation)).toBeUndefined();
    expect(
      getPatient({
        resourceType: 'Observation',
        subject: { reference: 'Device/123' },
      } as Observation)
    ).toBeUndefined();
    expect(
      getPatient({
        resourceType: 'Observation',
        subject: { reference: 'Patient/123' },
      } as Observation)
    ).toMatchObject({ reference: 'Patient/123' });

    expect(
      getPatient({
        resourceType: 'ServiceRequest',
        subject: { reference: 'Patient/123' },
      })
    ).toMatchObject({ reference: 'Patient/123' });

    expect(
      getPatient({
        resourceType: 'DiagnosticReport',
        subject: { reference: 'Patient/123' },
      })
    ).toMatchObject({ reference: 'Patient/123' });

    expect(getPatient({ resourceType: 'Patient' } as Patient)).toBeUndefined();
    expect(getPatient({ resourceType: 'Patient', id: undefined } as Patient)).toBeUndefined();
    expect(getPatient({ resourceType: 'Patient', id: null } as unknown as Patient)).toBeUndefined();
    expect(getPatient({ resourceType: 'Patient', id: '123' } as Patient)).toMatchObject({ reference: 'Patient/123' });
  });

  test('Follow search params', () => {
    const carePlan: CarePlan = {
      resourceType: 'CarePlan',
      subject: { reference: 'Patient/123' },
    };

    expect(getPatient(carePlan)).toMatchObject({ reference: 'Patient/123' });
  });
});
