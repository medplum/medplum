// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationKnowledge, Organization, Patient } from '@medplum/fhirtypes';
import {
  addPreferredPharmacyToPatient,
  createPreferredPharmacyExtension,
  getMedicationName,
  getPharmacyIdFromOrganization,
  getPreferredPharmaciesFromPatient,
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_PREFERENCE_TYPE_SYSTEM,
  PHARMACY_TYPE_PREFERRED,
  PHARMACY_TYPE_PRIMARY,
  removePreferredPharmacyFromPatient,
} from './utils';

type PatientExtension = NonNullable<Patient['extension']>[number];

const getPharmacyReference = (extension?: PatientExtension): string | undefined => {
  const pharmacyExt = extension?.extension?.find((ext) => ext.url === 'pharmacy');
  return pharmacyExt?.valueReference?.reference;
};

const getPharmacyTypeCode = (extension?: PatientExtension): string | undefined => {
  const typeExt = extension?.extension?.find((ext) => ext.url === 'type');
  return typeExt?.valueCodeableConcept?.coding?.[0]?.code;
};

const findPharmacyExtension = (extensions: Patient['extension'], reference: string): PatientExtension | undefined =>
  extensions?.find((extension) => getPharmacyReference(extension) === reference);

describe('utils', () => {
  describe('getMedicationName', () => {
    test('Returns medication name from code text', () => {
      const medication: MedicationKnowledge = {
        resourceType: 'MedicationKnowledge',
        id: 'test',
        code: {
          text: 'Test Medication',
        },
      };
      expect(getMedicationName(medication)).toBe('Test Medication');
    });

    test('Returns empty string when medication is undefined', () => {
      expect(getMedicationName(undefined)).toBe('');
    });

    test('Returns empty string when code is missing', () => {
      const medication: MedicationKnowledge = {
        resourceType: 'MedicationKnowledge',
        id: 'test',
      };
      expect(getMedicationName(medication)).toBe('');
    });

    test('Returns empty string when code text is missing', () => {
      const medication: MedicationKnowledge = {
        resourceType: 'MedicationKnowledge',
        id: 'test',
        code: {},
      };
      expect(getMedicationName(medication)).toBe('');
    });
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
                      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
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
                      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
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
                      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
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
                      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
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
                      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
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

    test('Skips extensions with no pharmacy reference', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                // Missing valueReference
              },
            ],
          },
        ],
      };

      expect(getPreferredPharmaciesFromPatient(patient)).toEqual([]);
    });

    test('Ignores non-pharmacy extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://example.com/other-extension',
            valueString: 'test',
          },
        ],
      };

      expect(getPreferredPharmaciesFromPatient(patient)).toEqual([]);
    });
  });

  describe('createPreferredPharmacyExtension', () => {
    test('Creates primary pharmacy extension', () => {
      const orgRef = { reference: 'Organization/123' };
      const ext = createPreferredPharmacyExtension(orgRef, true);

      expect(ext.url).toBe(PATIENT_PREFERRED_PHARMACY_URL);
      expect(ext.extension).toHaveLength(2);

      const pharmacyExt = ext.extension?.find((e) => e.url === 'pharmacy');
      expect(pharmacyExt?.valueReference).toBe(orgRef);

      const typeExt = ext.extension?.find((e) => e.url === 'type');
      expect(typeExt?.valueCodeableConcept?.coding?.[0]?.system).toBe(PHARMACY_PREFERENCE_TYPE_SYSTEM);
      expect(typeExt?.valueCodeableConcept?.coding?.[0]?.code).toBe(PHARMACY_TYPE_PRIMARY);
      expect(typeExt?.valueCodeableConcept?.coding?.[0]?.display).toBe('Primary Pharmacy');
    });

    test('Creates preferred pharmacy extension', () => {
      const orgRef = { reference: 'Organization/456' };
      const ext = createPreferredPharmacyExtension(orgRef, false);

      expect(ext.url).toBe(PATIENT_PREFERRED_PHARMACY_URL);

      const typeExt = ext.extension?.find((e) => e.url === 'type');
      expect(typeExt?.valueCodeableConcept?.coding?.[0]?.code).toBe(PHARMACY_TYPE_PREFERRED);
      expect(typeExt?.valueCodeableConcept?.coding?.[0]?.display).toBe('Preferred Pharmacy');
    });
  });

  describe('addPreferredPharmacyToPatient', () => {
    test('Adds pharmacy to patient with no extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };
      const orgRef = { reference: 'Organization/123' };

      const result = addPreferredPharmacyToPatient(patient, orgRef, false);

      expect(result.extension).toHaveLength(1);
      expect(result.extension?.[0].url).toBe(PATIENT_PREFERRED_PHARMACY_URL);
    });

    test('Adds primary pharmacy and demotes others', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: { reference: 'Organization/123' },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
                      code: PHARMACY_TYPE_PRIMARY,
                      display: 'Primary Pharmacy',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const newOrgRef = { reference: 'Organization/456' };

      const result = addPreferredPharmacyToPatient(patient, newOrgRef, true);

      expect(result.extension).toHaveLength(2);

      // Check that the old primary pharmacy is now preferred
      const oldPharmacy = findPharmacyExtension(result.extension, 'Organization/123');
      expect(getPharmacyTypeCode(oldPharmacy)).toBe(PHARMACY_TYPE_PREFERRED);

      // Check that the new pharmacy is primary
      const newPharmacy = findPharmacyExtension(result.extension, 'Organization/456');
      expect(getPharmacyTypeCode(newPharmacy)).toBe(PHARMACY_TYPE_PRIMARY);
    });

    test('Updates existing pharmacy when adding same organization', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: { reference: 'Organization/123' },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
                      code: PHARMACY_TYPE_PREFERRED,
                      display: 'Preferred Pharmacy',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const orgRef = { reference: 'Organization/123' };

      const result = addPreferredPharmacyToPatient(patient, orgRef, true);

      // Should still have only 1 extension, but updated
      expect(result.extension).toHaveLength(1);
      const typeExt = result.extension?.[0].extension?.find((e) => e.url === 'type');
      expect(typeExt?.valueCodeableConcept?.coding?.[0]?.code).toBe(PHARMACY_TYPE_PRIMARY);
    });

    test('Does not demote same pharmacy when setting as primary', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: { reference: 'Organization/123' },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
                      code: PHARMACY_TYPE_PREFERRED,
                      display: 'Preferred Pharmacy',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const orgRef = { reference: 'Organization/123' };

      const result = addPreferredPharmacyToPatient(patient, orgRef, true);

      expect(result.extension).toHaveLength(1);
      const typeExt = result.extension?.[0].extension?.find((e) => e.url === 'type');
      expect(typeExt?.valueCodeableConcept?.coding?.[0]?.code).toBe(PHARMACY_TYPE_PRIMARY);
    });

    test('Preserves other non-pharmacy extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://example.com/other',
            valueString: 'test',
          },
        ],
      };
      const orgRef = { reference: 'Organization/123' };

      const result = addPreferredPharmacyToPatient(patient, orgRef, false);

      expect(result.extension).toHaveLength(2);
      expect(result.extension?.find((e) => e.url === 'http://example.com/other')).toBeDefined();
    });
  });

  describe('removePreferredPharmacyFromPatient', () => {
    test('Removes pharmacy from patient', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: { reference: 'Organization/123' },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
                      code: PHARMACY_TYPE_PRIMARY,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const orgRef = { reference: 'Organization/123' };

      const result = removePreferredPharmacyFromPatient(patient, orgRef);

      expect(result.extension).toHaveLength(0);
    });

    test('Removes correct pharmacy from multiple', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: { reference: 'Organization/123' },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PRIMARY }],
                },
              },
            ],
          },
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: { reference: 'Organization/456' },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PREFERRED }],
                },
              },
            ],
          },
        ],
      };
      const orgRef = { reference: 'Organization/123' };

      const result = removePreferredPharmacyFromPatient(patient, orgRef);

      expect(result.extension).toHaveLength(1);
      const remaining = result.extension?.[0].extension?.find((e) => e.url === 'pharmacy');
      expect(remaining?.valueReference?.reference).toBe('Organization/456');
    });

    test('Returns unchanged patient when no extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };
      const orgRef = { reference: 'Organization/123' };

      const result = removePreferredPharmacyFromPatient(patient, orgRef);

      expect(result).toBe(patient);
    });

    test('Preserves non-pharmacy extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://example.com/other',
            valueString: 'test',
          },
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: { reference: 'Organization/123' },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PRIMARY }],
                },
              },
            ],
          },
        ],
      };
      const orgRef = { reference: 'Organization/123' };

      const result = removePreferredPharmacyFromPatient(patient, orgRef);

      expect(result.extension).toHaveLength(1);
      expect(result.extension?.[0].url).toBe('http://example.com/other');
    });

    test('Does nothing when pharmacy not found', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                valueReference: { reference: 'Organization/456' },
              },
              {
                url: 'type',
                valueCodeableConcept: {
                  coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PRIMARY }],
                },
              },
            ],
          },
        ],
      };
      const orgRef = { reference: 'Organization/123' };

      const result = removePreferredPharmacyFromPatient(patient, orgRef);

      expect(result.extension).toHaveLength(1);
    });

    test('Does not remove pharmacy extension without reference', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: PATIENT_PREFERRED_PHARMACY_URL,
            extension: [
              {
                url: 'pharmacy',
                // Missing valueReference
              },
            ],
          },
        ],
      };
      const orgRef = { reference: 'Organization/123' };

      const result = removePreferredPharmacyFromPatient(patient, orgRef);

      // Extensions without valueReference are kept (since they don't match the orgRef)
      expect(result.extension).toHaveLength(1);
    });
  });
});
