import { Account, CarePlan, ExplanationOfBenefit, Observation, Patient, Reference } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getPatientCompartmentParams, getPatient, getPatientResourceTypes } from './patient';
import { systemRepo } from './repo';
import { isResourceType } from '@medplum/core';
import { withTestContext } from '../test.setup';

describe('FHIR Patient utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

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

  test('External patient ID', () =>
    withTestContext(async () => {
      // If a user creates a resource,
      // and that resource has a reference to a patient,
      // but the patient reference is an external patient ID,
      // we should silently ignore the patient reference
      const eob = await systemRepo.createResource<ExplanationOfBenefit>({
        resourceType: 'ExplanationOfBenefit',
        status: 'active',
        use: 'claim',
        provider: {
          identifier: {
            system: 'http://hl7.org/fhir/sid/us-npi',
            value: '555555555',
          },
          display: 'Alice Smith',
        },
        patient: {
          reference: 'Patient/74532b683658335246434e495a53425462476c5741673d3d',
        },
        insurer: {
          display: 'Humana',
        },
        created: '2020-06-11',
        outcome: 'complete',
        insurance: [
          {
            focal: true,
            coverage: {
              identifier: {
                system: 'https://fhir.humana.com/documentation/glossary/memberIdBase',
                value: 'H40183968',
              },
            },
          },
        ],
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/claim-type',
              code: 'pharmacy',
              display: 'Pharmacy',
            },
          ],
          text: 'Pharmacy',
        },
      });
      expect(eob).toBeDefined();
    }));

  test('getPatientResourceTypes', () => {
    const resourceTypes = getPatientResourceTypes();
    expect(resourceTypes.length).toBeGreaterThan(1);
    resourceTypes.forEach((resourceType) => {
      expect(isResourceType(resourceType)).toBe(true);
    });
  });
});
