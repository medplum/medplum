// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle, indexStructureDefinitionBundle, RXNORM } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Patient, Practitioner, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { PhotonPatient, PhotonPatientAllergy, PhotonPrescription, PhotonProvider } from '../photon-types';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_PATIENTS } from './constants';
import {
  createAllergies,
  createPatientResource,
  createPrescriptions,
  getExistingPatient,
  getPrescriber,
  getStatusFromPhotonState,
  handler,
} from './sync-patient-from-photon';

describe('Sync patients from Photon', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  describe('handler', async () => {
    test('Executes a batch of resources', async () => {
      const medplum = new MockClient();
      const executeBatchSpy = vi.spyOn(medplum, 'executeBatch').mockResolvedValue({
        resourceType: 'Bundle',
        type: 'batch-response',
        entry: [],
      });

      // Mock the photon GraphQL fetch
      vi.mock('./utils.ts', async () => {
        const actual = await vi.importActual('./utils.ts');
        return {
          ...actual,
          handlePhotonAuth: vi.fn().mockImplementation(() => 'example-auth-token'),
          photonGraphqlFetch: vi.fn().mockImplementation(() => {
            return {
              data: {
                patients: [
                  {
                    id: '123',
                    externalId: undefined,
                    name: { first: 'John', last: 'Doe', full: 'Jane Doe' },
                    sex: 'MALE',
                    dateOfBirth: '1990-01-01',
                    phone: '555-1234',
                    allergies: [],
                    prescriptions: [],
                  },
                ],
              },
            };
          }),
        };
      });

      const mockEvent = {
        secrets: {
          PHOTON_CLIENT_ID: { valueString: 'test-id' },
          PHOTON_CLIENT_SECRET: { valueString: 'test-secret' },
        },
      };

      await handler(medplum, mockEvent as any);

      // Verify executeBatch was called with a non-empty bundle
      expect(executeBatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Bundle',
          type: 'batch',
          entry: expect.arrayContaining([
            expect.objectContaining({
              resource: expect.objectContaining({
                resourceType: 'Patient',
              }),
            }),
          ]),
        })
      );

      executeBatchSpy.mockRestore();
    });
  });

  describe('getExistingPatient', async () => {
    test('Get a patient with no external id', async () => {
      const medplum = new MockClient();
      const photonPatient: PhotonPatient = {
        id: 'example-id',
        dateOfBirth: '1984-11-20',
        sex: 'FEMALE',
        name: {
          first: 'Homer',
          last: 'Simpson',
          full: 'Homer Simpson',
        },
        phone: '9085552432',
      };

      const result = await getExistingPatient(photonPatient, medplum);
      expect(result).toBeUndefined();
    });

    test('Get patient with external id not in Medplum', async () => {
      const medplum = new MockClient();
      const photonPatient = { externalId: 'exterenalId' } as PhotonPatient;
      const result = await getExistingPatient(photonPatient, medplum);
      expect(result).toBeUndefined();
    });

    test('Get an existing patient', async () => {
      const medplum = new MockClient();
      const patient: Patient = await medplum.createResource({
        resourceType: 'Patient',
      });

      const photonPatient = { externalId: patient.id as string } as PhotonPatient;
      const result = await getExistingPatient(photonPatient, medplum);
      expect(result).toStrictEqual(patient);
    });

    test('Get patient by Photon ID', async () => {
      const medplum = new MockClient();
      const patient = await medplum.createResource({
        resourceType: 'Patient',
        identifier: [{ system: NEUTRON_HEALTH_PATIENTS, value: 'example-photon-id' }],
      });
      const photonPatient = { id: 'example-photon-id' } as PhotonPatient;
      const result = await getExistingPatient(photonPatient, medplum);
      expect(result).toStrictEqual(patient);
    });
  });

  describe('createPatientResource', async () => {
    test('Create a patient with full resource details', async () => {
      const photonPatient = {
        id: '123',
        name: { first: 'John', last: 'Doe' },
        sex: 'MALE',
        dateOfBirth: '1990-01-01',
        phone: '555-1234',
        email: 'john@example.com',
        address: {
          street1: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          postalCode: '12345',
          country: 'US',
        },
      } as PhotonPatient;

      const patient = await createPatientResource(photonPatient);

      expect(patient).toEqual(
        expect.objectContaining({
          resourceType: 'Patient',
          name: [{ family: 'Doe', given: ['John'] }],
          gender: 'male',
          birthDate: '1990-01-01',
          telecom: [
            { system: 'phone', value: '555-1234' },
            { system: 'email', value: 'john@example.com' },
          ],
          address: [
            expect.objectContaining({
              line: ['123 Main St'],
              city: 'Springfield',
              state: 'IL',
              postalCode: '12345',
              country: 'US',
            }),
          ],
        })
      );
    });
  });

  describe('createAllergies', async () => {
    const patientReference: Reference<Patient> = { reference: 'Patient/123', display: 'Homer Simpson' };

    test('Correctly handles allergies', async () => {
      const photonAllergies: PhotonPatientAllergy[] = [
        {
          allergen: { id: 'photon-id', rxcui: '12345', name: 'Penicillin' },
          comment: 'Severe reaction',
          onset: '2022-01-01',
        },
        {
          allergen: { id: 'photon-id', rxcui: undefined, name: 'Unknown' }, // Should be skipped
        },
      ];

      const allergies = createAllergies(patientReference, photonAllergies);
      expect(allergies?.length).toBe(1);
      expect(allergies?.[0]).toEqual(
        expect.objectContaining({
          resourceType: 'AllergyIntolerance',
          patient: patientReference,
          code: {
            coding: [
              {
                system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
                code: '12345',
                display: 'Penicillin',
              },
            ],
          },
          onsetDateTime: '2022-01-01',
          note: [{ text: 'Severe reaction' }],
        })
      );
    });

    test('No allergies', async () => {
      const result = createAllergies(patientReference, []);
      expect(result).toBeUndefined();
    });
  });

  describe('createPrescriptions', async () => {
    const patientReference: Reference<Patient> = { reference: 'Patient/123', display: 'Homer Simpson' };

    test('No prescriptions', async () => {
      const medplum = new MockClient();
      const result = await createPrescriptions(patientReference, medplum, []);
      expect(result).toBeUndefined();
    });

    test('Creates a prescription', async () => {
      const medplum = new MockClient();
      const photonPrescriptions: PhotonPrescription[] = [
        {
          id: 'rx-123',
          state: 'ACTIVE',
          treatment: {
            id: 'example-id',
            codes: { rxcui: '12345' },
            name: 'Test Medication',
          },
          prescriber: {
            id: 'provider-123',
            name: {
              first: 'Alice',
              last: 'Smith',
              title: 'Dr.',
              full: 'Dr. Alice Smith',
            },
            email: 'dralicesmith@example.com',
            phone: '6105558932',
            address: {
              street1: '123 Main Street',
              city: 'Anytown',
              state: 'IN',
              country: 'USA',
              postalCode: '09328',
            },
          } as PhotonProvider,
          dispenseQuantity: 30,
          dispenseUnit: 'tablets',
          refillsAllowed: 3,
          daysSupply: 30,
          effectiveDate: '2023-01-01',
          expirationDate: '2023-12-31',
          dispenseAsWritten: false,
          instructions: 'Take one tablet daily',
          writtenAt: '2023-01-01T00:00:00Z',
          notes: 'Additional notes',
        } as PhotonPrescription,
      ];
      const result = await createPrescriptions(patientReference, medplum, photonPrescriptions);

      expect(result).toHaveLength(1);
      const prescription = result?.[0];

      expect(prescription).toEqual(
        expect.objectContaining({
          resourceType: 'MedicationRequest',
          status: 'active',
          intent: 'order',
          subject: patientReference,
          identifier: [{ system: NEUTRON_HEALTH, value: 'rx-123' }],
          dispenseRequest: {
            quantity: {
              value: 30,
              unit: 'tablets',
            },
            numberOfRepeatsAllowed: 3,
            expectedSupplyDuration: { value: 30, unit: 'days' },
            validityPeriod: {
              start: '2023-01-01',
              end: '2023-12-31',
            },
          },
          substitution: { allowedBoolean: true },
          dosageInstruction: [{ patientInstruction: 'Take one tablet daily' }],
          authoredOn: '2023-01-01T00:00:00Z',
          medicationCodeableConcept: {
            coding: [{ system: RXNORM, code: '12345', display: 'Test Medication' }],
          },
          note: [{ text: 'Additional notes' }],
        })
      );
    });
  });

  describe('Prescriber functions', async () => {
    test('Get prescriber by medplum ID', async () => {
      const medplum = new MockClient();
      const practitioner: Practitioner = await medplum.createResource({
        resourceType: 'Practitioner',
      });

      const photonProvider = { id: 'example-id', externalId: practitioner.id } as PhotonProvider;
      const result = await getPrescriber(medplum, photonProvider);
      expect(result).toStrictEqual(practitioner);
    });

    test('Get prescriber by Photon identifier', async () => {
      const medplum = new MockClient();
      const practitioner: Practitioner = await medplum.createResource({
        resourceType: 'Practitioner',
        identifier: [{ system: NEUTRON_HEALTH, value: 'example-id' }],
      });
      const photonProvider = { id: 'example-id' } as PhotonProvider;
      const result = await getPrescriber(medplum, photonProvider);
      expect(result).toStrictEqual(practitioner);
    });

    test('Create practitioner reference if none exists', async () => {
      const medplum = new MockClient();

      const photonProvider: PhotonProvider = {
        id: 'example-id',
        name: {
          first: 'Alice',
          last: 'Smith',
          title: 'Dr.',
          full: 'Dr. Alice Smith',
        },
        email: 'dralicesmith@aol.com',
        phone: '9085556392',
        address: {
          street1: '85 Willow Lane',
          street2: 'Apt B',
          city: 'Youngstown',
          state: 'OH',
          country: 'US',
          postalCode: '44405',
        },
        organizations: [],
      };

      const result = await getPrescriber(medplum, photonProvider);
      expect(result).toBeUndefined();
    });
  });

  describe('getStatusFromPhotonState', async () => {
    test('Map Photon states to FHIR statuses', async () => {
      const testCases = [
        { input: 'ACTIVE', expected: 'active' },
        { input: 'CANCELED', expected: 'cancelled' },
        { input: 'DEPLETED', expected: 'completed' },
        { input: 'EXPIRED', expected: 'stopped' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = getStatusFromPhotonState(input as PhotonPrescription['state']);
        expect(result).toBe(expected);
      });
    });

    test('Invalid state', async () => {
      expect(() => getStatusFromPhotonState('invalid-state' as PhotonPrescription['state'])).toThrow(
        'Invalid state provided'
      );
    });
  });
});
