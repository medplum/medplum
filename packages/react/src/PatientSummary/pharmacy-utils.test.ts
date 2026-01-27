// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Patient } from '@medplum/fhirtypes';
import {
  DOSESPOT_ADD_PATIENT_PHARMACY_BOT,
  DOSESPOT_SEARCH_PHARMACY_BOT,
  getPreferredPharmaciesFromPatient,
  MEDPLUM_BOT_SYSTEM,
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_PREFERENCE_TYPE_SYSTEM,
  PHARMACY_TYPE_PREFERRED,
  PHARMACY_TYPE_PRIMARY,
} from './pharmacy-utils';

describe('pharmacy-utils', () => {
  describe('Constants', () => {
    test('PATIENT_PREFERRED_PHARMACY_URL is correct', () => {
      expect(PATIENT_PREFERRED_PHARMACY_URL).toBe('http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy');
    });

    test('PHARMACY_TYPE_PRIMARY is correct', () => {
      expect(PHARMACY_TYPE_PRIMARY).toBe('primary');
    });

    test('PHARMACY_TYPE_PREFERRED is correct', () => {
      expect(PHARMACY_TYPE_PREFERRED).toBe('preferred');
    });

    test('PHARMACY_PREFERENCE_TYPE_SYSTEM is correct', () => {
      expect(PHARMACY_PREFERENCE_TYPE_SYSTEM).toBe('https://dosespot.com/pharmacy-preference-type');
    });

    test('MEDPLUM_BOT_SYSTEM is correct', () => {
      expect(MEDPLUM_BOT_SYSTEM).toBe('https://www.medplum.com/bots');
    });

    test('DOSESPOT_SEARCH_PHARMACY_BOT has correct structure', () => {
      expect(DOSESPOT_SEARCH_PHARMACY_BOT).toEqual({
        system: 'https://www.medplum.com/bots',
        value: 'dosespot-search-pharmacy-bot',
      });
    });

    test('DOSESPOT_ADD_PATIENT_PHARMACY_BOT has correct structure', () => {
      expect(DOSESPOT_ADD_PATIENT_PHARMACY_BOT).toEqual({
        system: 'https://www.medplum.com/bots',
        value: 'dosespot-add-patient-pharmacy-bot',
      });
    });
  });

  describe('getPreferredPharmaciesFromPatient', () => {
    test('Returns empty array when patient has no extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };

      const result = getPreferredPharmaciesFromPatient(patient);
      expect(result).toEqual([]);
    });

    test('Returns empty array when patient has no pharmacy extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://example.com/other-extension',
            valueString: 'test',
          },
        ],
      };

      const result = getPreferredPharmaciesFromPatient(patient);
      expect(result).toEqual([]);
    });

    test('Returns pharmacy with primary type', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
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
                      code: 'primary',
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
      expect(result[0]).toEqual({
        organizationRef: {
          reference: 'Organization/123',
        },
        isPrimary: true,
      });
    });

    test('Returns pharmacy with preferred (non-primary) type', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
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
                      code: PHARMACY_TYPE_PREFERRED,
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
      expect(result[0]).toEqual({
        organizationRef: {
          reference: 'Organization/456',
        },
        isPrimary: false,
      });
    });

    test('Returns multiple pharmacies', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
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
                      code: 'primary',
                    },
                  ],
                },
              },
            ],
          },
          {
            url: 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
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
                      code: PHARMACY_TYPE_PREFERRED,
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

    test('Skips invalid extensions without pharmacy reference', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
            extension: [
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'https://dosespot.com/pharmacy-preference-type',
                      code: 'primary',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = getPreferredPharmaciesFromPatient(patient);
      expect(result).toEqual([]);
    });

    test('Returns pharmacy without type as non-primary', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
            extension: [
              {
                url: 'pharmacy',
                valueReference: {
                  reference: 'Organization/123',
                },
              },
            ],
          },
        ],
      };

      const result = getPreferredPharmaciesFromPatient(patient);
      expect(result).toHaveLength(1);
      expect(result[0].organizationRef.reference).toBe('Organization/123');
      expect(result[0].isPrimary).toBe(false);
    });

    test('Ignores type with wrong system', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
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
                      system: 'http://wrong-system.com',
                      code: 'primary',
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
      // Should be false because the system doesn't match
      expect(result[0].isPrimary).toBe(false);
    });

    test('Skips extensions without nested extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
            valueString: 'invalid',
          },
        ],
      };

      const result = getPreferredPharmaciesFromPatient(patient);
      expect(result).toEqual([]);
    });
  });
});
