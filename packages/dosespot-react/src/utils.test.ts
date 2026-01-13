// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationKnowledge, Organization, Patient } from '@medplum/fhirtypes';
import {
  getMedicationName,
  getPharmacyIdFromOrganization,
  getPreferredPharmaciesFromPatient,
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_TYPE_PRIMARY,
} from './utils';

describe('utils', () => {
  test('getMedicationName', () => {
    const medication: MedicationKnowledge = {
      resourceType: 'MedicationKnowledge',
      id: 'test',
      code: {
        text: 'Test Medication',
      },
    };
    expect(getMedicationName(medication)).toBe('Test Medication');
  });

  describe('getPharmacyIdFromOrganization', () => {
    test('Extracts DoseSpot pharmacy ID', () => {
      const org: Organization = {
        resourceType: 'Organization',
        identifier: [
          {
            system: 'https://dosespot.com/pharmacy-id',
            value: '12345',
          },
        ],
      };
      expect(getPharmacyIdFromOrganization(org)).toBe(12345);
    });

    test('Returns undefined when no pharmacy ID', () => {
      const org: Organization = {
        resourceType: 'Organization',
      };
      expect(getPharmacyIdFromOrganization(org)).toBeUndefined();
    });

    test('Returns undefined when identifier has different system', () => {
      const org: Organization = {
        resourceType: 'Organization',
        identifier: [
          {
            system: 'http://example.com/other-id',
            value: '12345',
          },
        ],
      };
      expect(getPharmacyIdFromOrganization(org)).toBeUndefined();
    });
  });

  describe('getPreferredPharmaciesFromPatient', () => {
    test('Returns empty array when no extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };
      expect(getPreferredPharmaciesFromPatient(patient)).toEqual([]);
    });

    test('Returns primary pharmacy', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: {
                  reference: 'Organization/123',
                },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'https://dosespot.com/pharmacy-preference-type',
                      code: PHARMACY_TYPE_PRIMARY,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = getPreferredPharmaciesFromPatient(patient);
      expect(result).toHaveLength(1);
      expect(result[0].organizationRef.reference).toBe('Organization/123');
      expect(result[0].isPrimary).toBe(true);
    });

    test('Returns non-primary pharmacy', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: {
                  reference: 'Organization/456',
                },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'https://dosespot.com/pharmacy-preference-type',
                      code: 'preferred',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = getPreferredPharmaciesFromPatient(patient);
      expect(result).toHaveLength(1);
      expect(result[0].isPrimary).toBe(false);
    });

    test('Returns multiple pharmacies', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: {
                  reference: 'Organization/123',
                },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'https://dosespot.com/pharmacy-preference-type',
                      code: PHARMACY_TYPE_PRIMARY,
                    },
                  ],
                },
              },
            ],
          },
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: {
                  reference: 'Organization/456',
                },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'https://dosespot.com/pharmacy-preference-type',
                      code: 'preferred',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = getPreferredPharmaciesFromPatient(patient);
      expect(result).toHaveLength(2);
      expect(result[0].isPrimary).toBe(true);
      expect(result[1].isPrimary).toBe(false);
    });

    test('Skips invalid extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'https://dosespot.com/pharmacy-preference-type',
                      code: PHARMACY_TYPE_PRIMARY,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      expect(getPreferredPharmaciesFromPatient(patient)).toEqual([]);
    });
  });
});
