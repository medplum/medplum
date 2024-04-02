import { isResourceType } from '@medplum/core';
import {
  Account,
  CarePlan,
  Communication,
  ExplanationOfBenefit,
  Observation,
  Patient,
  Reference,
} from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { withTestContext } from '../test.setup';
import { getPatientCompartmentParams, getPatientResourceTypes, getPatients } from './patient';
import { getSystemRepo } from './repo';

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

  test('getPatients', () => {
    expect(
      getPatients({
        resourceType: 'Account',
        subject: [] as Reference[],
      } as Account)
    ).toEqual([]);
    expect(getPatients({ resourceType: 'Account', subject: [{}] } as Account)).toEqual([]);
    expect(
      getPatients({
        resourceType: 'Account',
        subject: [{ reference: 'Device/123' }],
      } as Account)
    ).toEqual([]);
    expect(
      getPatients({
        resourceType: 'Account',
        subject: [{ reference: 'Patient/123' }],
      } as Account)
    ).toMatchObject([{ reference: 'Patient/123' }]);

    expect(getPatients({ resourceType: 'Observation' } as Observation)).toEqual([]);
    expect(
      getPatients({
        resourceType: 'Observation',
        subject: undefined,
      } as Observation)
    ).toEqual([]);
    expect(
      getPatients({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'abc' },
        subject: 'bad',
      } as Observation)
    ).toEqual([]);
    expect(
      getPatients({
        resourceType: 'Observation',
        subject: null,
      } as unknown as Observation)
    ).toEqual([]);
    expect(getPatients({ resourceType: 'Observation', subject: {} } as Observation)).toEqual([]);
    expect(
      getPatients({
        resourceType: 'Observation',
        subject: { reference: 'Device/123' },
      } as Observation)
    ).toEqual([]);
    expect(
      getPatients({
        resourceType: 'Observation',
        subject: { reference: 'Patient/123' },
      } as Observation)
    ).toMatchObject([{ reference: 'Patient/123' }]);

    expect(
      getPatients({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: { text: 'abc' },
        subject: { reference: 'Patient/123' },
      })
    ).toMatchObject([{ reference: 'Patient/123' }]);

    expect(
      getPatients({
        resourceType: 'DiagnosticReport',
        status: 'final',
        code: { text: 'abc' },
        subject: { reference: 'Patient/123' },
      })
    ).toMatchObject([{ reference: 'Patient/123' }]);

    expect(getPatients({ resourceType: 'Patient' } as Patient)).toEqual([]);
    expect(getPatients({ resourceType: 'Patient', id: undefined } as Patient)).toEqual([]);
    expect(getPatients({ resourceType: 'Patient', id: null } as unknown as Patient)).toEqual([]);
    expect(getPatients({ resourceType: 'Patient', id: '123' } as Patient)).toMatchObject([
      { reference: 'Patient/123' },
    ]);
  });

  test('Multiple patients', () => {
    const communication: Communication = {
      resourceType: 'Communication',
      status: 'completed',
      subject: { reference: 'Patient/123' },
      sender: { reference: 'Patient/456' },
      recipient: [{ reference: 'Patient/789' }],
    };
    expect(sortReferenceArray(getPatients(communication))).toMatchObject([
      { reference: 'Patient/123' },
      { reference: 'Patient/456' },
      { reference: 'Patient/789' },
    ]);
  });

  test('Duplicate patients', () => {
    const communication: Communication = {
      resourceType: 'Communication',
      status: 'completed',
      subject: { reference: 'Patient/123' },
      sender: { reference: 'Patient/123' },
      recipient: [{ reference: 'Patient/789' }],
    };
    expect(sortReferenceArray(getPatients(communication))).toMatchObject([
      { reference: 'Patient/123' },
      { reference: 'Patient/789' },
    ]);
  });

  test('Follow search params', () => {
    const carePlan: CarePlan = {
      resourceType: 'CarePlan',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/123' },
    };

    expect(getPatients(carePlan)).toMatchObject([{ reference: 'Patient/123' }]);
  });

  test('External patient ID', () =>
    withTestContext(async () => {
      // If a user creates a resource,
      // and that resource has a reference to a patient,
      // but the patient reference is an external patient ID,
      // we should silently ignore the patient reference
      const systemRepo = getSystemRepo();
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

function sortReferenceArray<T extends Reference & { reference: string }>(input: T[]): T[] {
  return input.sort((a, b) => a.reference.localeCompare(b.reference));
}
