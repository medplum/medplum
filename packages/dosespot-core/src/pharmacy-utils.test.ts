// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Organization, Patient, Reference } from '@medplum/fhirtypes';
import {
  addPreferredPharmacyToPatient,
  createPreferredPharmacyExtension,
  DOSESPOT_ADD_PATIENT_PHARMACY_BOT,
  DOSESPOT_PHARMACY_PREFERENCE_TYPE_SYSTEM,
  DOSESPOT_SEARCH_PHARMACY_BOT,
  getPreferredPharmaciesFromPatient,
  MEDPLUM_BOT_SYSTEM,
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_PREFERENCE_TYPE_SYSTEM,
  PHARMACY_TYPE_PREFERRED,
  PHARMACY_TYPE_PRIMARY,
  removePreferredPharmacyFromPatient,
} from './pharmacy-utils';

describe('Constants', () => {
  test('PATIENT_PREFERRED_PHARMACY_URL is exported and used in the codebase', () => {
    expect(PATIENT_PREFERRED_PHARMACY_URL).toBeDefined();
    expect(typeof PATIENT_PREFERRED_PHARMACY_URL).toBe('string');
  });

  test('PHARMACY_TYPE_PRIMARY is correct', () => {
    expect(PHARMACY_TYPE_PRIMARY).toBe('primary');
  });

  test('PHARMACY_TYPE_PREFERRED is correct', () => {
    expect(PHARMACY_TYPE_PREFERRED).toBe('preferred');
  });

  test('PHARMACY_PREFERENCE_TYPE_SYSTEM is the generic default', () => {
    expect(PHARMACY_PREFERENCE_TYPE_SYSTEM).toBe('https://medplum.com/fhir/CodeSystem/pharmacy-preference-type');
  });

  test('DOSESPOT_PHARMACY_PREFERENCE_TYPE_SYSTEM is the DoseSpot-specific system', () => {
    expect(DOSESPOT_PHARMACY_PREFERENCE_TYPE_SYSTEM).toBe('https://dosespot.com/pharmacy-preference-type');
  });

  test('MEDPLUM_BOT_SYSTEM is correct', () => {
    expect(MEDPLUM_BOT_SYSTEM).toBe('https://www.medplum.com/bots');
  });

  test('DOSESPOT_SEARCH_PHARMACY_BOT has correct structure', () => {
    expect(DOSESPOT_SEARCH_PHARMACY_BOT).toEqual({
      system: MEDPLUM_BOT_SYSTEM,
      value: 'dosespot-search-pharmacy-bot',
    });
  });

  test('DOSESPOT_ADD_PATIENT_PHARMACY_BOT has correct structure', () => {
    expect(DOSESPOT_ADD_PATIENT_PHARMACY_BOT).toEqual({
      system: MEDPLUM_BOT_SYSTEM,
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

  test('Skips invalid extensions without pharmacy reference', () => {
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

    const result = getPreferredPharmaciesFromPatient(patient);
    expect(result).toEqual([]);
  });

  test('Returns pharmacy without type as non-primary', () => {
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
          ],
        },
      ],
    };

    const result = getPreferredPharmaciesFromPatient(patient);
    expect(result).toHaveLength(1);
    expect(result[0].organizationRef.reference).toBe('Organization/123');
    expect(result[0].isPrimary).toBe(false);
  });

  test('Matches primary regardless of system by default', () => {
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
                    system: 'https://any-vendor.com',
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
    // Default (no system filter) matches any system
    expect(result[0].isPrimary).toBe(true);
  });

  test('Ignores type with wrong system when explicit system is provided', () => {
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
                    system: 'https://wrong-system.com',
                    code: PHARMACY_TYPE_PRIMARY,
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = getPreferredPharmaciesFromPatient(patient, DOSESPOT_PHARMACY_PREFERENCE_TYPE_SYSTEM);
    expect(result).toHaveLength(1);
    // Should be false because the system doesn't match the DoseSpot system
    expect(result[0].isPrimary).toBe(false);
  });

  test('Skips extensions without nested extensions', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          valueString: 'invalid',
        },
      ],
    };

    const result = getPreferredPharmaciesFromPatient(patient);
    expect(result).toEqual([]);
  });
});

describe('createPreferredPharmacyExtension', () => {
  test('Creates primary pharmacy extension', () => {
    const orgRef: Reference<Organization> = { reference: 'Organization/123' };
    const extension = createPreferredPharmacyExtension(orgRef, true);

    expect(extension.url).toBe(PATIENT_PREFERRED_PHARMACY_URL);
    expect(extension.extension).toHaveLength(2);

    const pharmacyExt = extension.extension?.find((e) => e.url === 'pharmacy');
    expect(pharmacyExt?.valueReference).toEqual({ reference: 'Organization/123' });

    const typeExt = extension.extension?.find((e) => e.url === 'type');
    expect(typeExt?.valueCodeableConcept?.coding?.[0]).toEqual({
      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
      code: PHARMACY_TYPE_PRIMARY,
      display: 'Primary Pharmacy',
    });
  });

  test('Creates preferred pharmacy extension', () => {
    const orgRef: Reference<Organization> = { reference: 'Organization/456' };
    const extension = createPreferredPharmacyExtension(orgRef, false);

    expect(extension.url).toBe(PATIENT_PREFERRED_PHARMACY_URL);

    const typeExt = extension.extension?.find((e) => e.url === 'type');
    expect(typeExt?.valueCodeableConcept?.coding?.[0]).toEqual({
      system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
      code: PHARMACY_TYPE_PREFERRED,
      display: 'Preferred Pharmacy',
    });
  });
});

describe('addPreferredPharmacyToPatient', () => {
  test('Adds pharmacy to patient with no extensions', () => {
    const patient: Patient = { resourceType: 'Patient' };
    const orgRef: Reference<Organization> = { reference: 'Organization/123' };

    const result = addPreferredPharmacyToPatient(patient, orgRef, false);

    expect(result.extension).toHaveLength(1);
    expect(result.extension?.[0].url).toBe(PATIENT_PREFERRED_PHARMACY_URL);
  });

  test('Adds pharmacy to patient with existing extensions', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [{ url: 'http://example.com/other', valueString: 'test' }],
    };
    const orgRef: Reference<Organization> = { reference: 'Organization/123' };

    const result = addPreferredPharmacyToPatient(patient, orgRef, false);

    expect(result.extension).toHaveLength(2);
  });

  test('Updates existing pharmacy extension', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            { url: 'pharmacy', valueReference: { reference: 'Organization/123' } },
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
    const orgRef: Reference<Organization> = { reference: 'Organization/123' };

    const result = addPreferredPharmacyToPatient(patient, orgRef, true);

    expect(result.extension).toHaveLength(1);
    const typeExt = result.extension?.[0].extension?.find((e) => e.url === 'type');
    expect(typeExt?.valueCodeableConcept?.coding?.[0].code).toBe(PHARMACY_TYPE_PRIMARY);
  });

  test('Demotes other pharmacies when adding primary', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            { url: 'pharmacy', valueReference: { reference: 'Organization/existing' } },
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
    const orgRef: Reference<Organization> = { reference: 'Organization/new' };

    const result = addPreferredPharmacyToPatient(patient, orgRef, true);

    expect(result.extension).toHaveLength(2);

    // Original pharmacy should be demoted
    const existingPharmacy = result.extension?.find((ext) => {
      const ref = ext.extension?.find((e) => e.url === 'pharmacy')?.valueReference?.reference;
      return ref === 'Organization/existing';
    });
    const existingType = existingPharmacy?.extension?.find((e) => e.url === 'type');
    expect(existingType?.valueCodeableConcept?.coding?.[0].code).toBe(PHARMACY_TYPE_PREFERRED);

    // New pharmacy should be primary
    const newPharmacy = result.extension?.find((ext) => {
      const ref = ext.extension?.find((e) => e.url === 'pharmacy')?.valueReference?.reference;
      return ref === 'Organization/new';
    });
    const newType = newPharmacy?.extension?.find((e) => e.url === 'type');
    expect(newType?.valueCodeableConcept?.coding?.[0].code).toBe(PHARMACY_TYPE_PRIMARY);
  });

  test('Does not demote when adding non-primary', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            { url: 'pharmacy', valueReference: { reference: 'Organization/existing' } },
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
    const orgRef: Reference<Organization> = { reference: 'Organization/new' };

    const result = addPreferredPharmacyToPatient(patient, orgRef, false);

    // Original pharmacy should remain primary
    const existingPharmacy = result.extension?.find((ext) => {
      const ref = ext.extension?.find((e) => e.url === 'pharmacy')?.valueReference?.reference;
      return ref === 'Organization/existing';
    });
    const existingType = existingPharmacy?.extension?.find((e) => e.url === 'type');
    expect(existingType?.valueCodeableConcept?.coding?.[0].code).toBe(PHARMACY_TYPE_PRIMARY);
  });

  test('Handles extension without type sub-extension during demotion', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [{ url: 'pharmacy', valueReference: { reference: 'Organization/existing' } }],
        },
      ],
    };
    const orgRef: Reference<Organization> = { reference: 'Organization/new' };

    // Should not throw
    const result = addPreferredPharmacyToPatient(patient, orgRef, true);
    expect(result.extension).toHaveLength(2);
  });
});

describe('removePreferredPharmacyFromPatient', () => {
  test('Returns patient unchanged when no extensions', () => {
    const patient: Patient = { resourceType: 'Patient' };
    const orgRef: Reference<Organization> = { reference: 'Organization/123' };

    const result = removePreferredPharmacyFromPatient(patient, orgRef);

    expect(result.extension).toBeUndefined();
  });

  test('Removes matching pharmacy extension', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            { url: 'pharmacy', valueReference: { reference: 'Organization/123' } },
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
    const orgRef: Reference<Organization> = { reference: 'Organization/123' };

    const result = removePreferredPharmacyFromPatient(patient, orgRef);

    expect(result.extension).toHaveLength(0);
  });

  test('Keeps non-matching pharmacy extensions', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            { url: 'pharmacy', valueReference: { reference: 'Organization/123' } },
            {
              url: 'type',
              valueCodeableConcept: {
                coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PREFERRED }],
              },
            },
          ],
        },
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            { url: 'pharmacy', valueReference: { reference: 'Organization/456' } },
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
    const orgRef: Reference<Organization> = { reference: 'Organization/123' };

    const result = removePreferredPharmacyFromPatient(patient, orgRef);

    expect(result.extension).toHaveLength(1);
    const remaining = result.extension?.[0].extension?.find((e) => e.url === 'pharmacy');
    expect(remaining?.valueReference?.reference).toBe('Organization/456');
  });

  test('Keeps non-pharmacy extensions', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        { url: 'http://example.com/other', valueString: 'test' },
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [{ url: 'pharmacy', valueReference: { reference: 'Organization/123' } }],
        },
      ],
    };
    const orgRef: Reference<Organization> = { reference: 'Organization/123' };

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
          extension: [{ url: 'pharmacy', valueReference: { reference: 'Organization/123' } }],
        },
      ],
    };
    const orgRef: Reference<Organization> = { reference: 'Organization/999' };

    const result = removePreferredPharmacyFromPatient(patient, orgRef);

    expect(result.extension).toHaveLength(1);
  });
});
