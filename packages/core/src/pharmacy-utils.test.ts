// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Organization, Patient, Reference } from '@medplum/fhirtypes';
import { HTTP_HL7_ORG } from './constants';
import {
  addPreferredPharmacyToPatient,
  createPreferredPharmacyExtension,
  getPreferredPharmaciesFromPatient,
  isAddPharmacyResponse,
  isOrganizationArray,
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_PREFERENCE_TYPE_SYSTEM,
  PHARMACY_TYPE_PREFERRED,
  PHARMACY_TYPE_PRIMARY,
  removePreferredPharmacyFromPatient,
} from './pharmacy-utils';

describe('Constants', () => {
  test('PATIENT_PREFERRED_PHARMACY_URL is correct', () => {
    expect(PATIENT_PREFERRED_PHARMACY_URL).toBe(`${HTTP_HL7_ORG}/fhir/StructureDefinition/patient-preferredPharmacy`);
  });

  test('PHARMACY_TYPE_PRIMARY is correct', () => {
    expect(PHARMACY_TYPE_PRIMARY).toBe('primary');
  });

  test('PHARMACY_TYPE_PREFERRED is correct', () => {
    expect(PHARMACY_TYPE_PREFERRED).toBe('preferred');
  });

  test('PHARMACY_PREFERENCE_TYPE_SYSTEM is correct', () => {
    expect(PHARMACY_PREFERENCE_TYPE_SYSTEM).toBe('https://medplum.com/fhir/CodeSystem/pharmacy-preference-type');
  });
});

describe('getPreferredPharmaciesFromPatient', () => {
  test('Returns empty array when patient has no extensions', () => {
    const patient: Patient = { resourceType: 'Patient' };
    expect(getPreferredPharmaciesFromPatient(patient)).toEqual([]);
  });

  test('Returns empty array when patient has no pharmacy extensions', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [{ url: 'http://example.com/other-extension', valueString: 'test' }],
    };
    expect(getPreferredPharmaciesFromPatient(patient)).toEqual([]);
  });

  test('Returns pharmacy with primary type', () => {
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
                coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PRIMARY }],
              },
            },
          ],
        },
      ],
    };
    const result = getPreferredPharmaciesFromPatient(patient);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ organizationRef: { reference: 'Organization/123' }, isPrimary: true });
  });

  test('Returns pharmacy with preferred (non-primary) type', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            { url: 'pharmacy', valueReference: { reference: 'Organization/456' } },
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
    const result = getPreferredPharmaciesFromPatient(patient);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ organizationRef: { reference: 'Organization/456' }, isPrimary: false });
  });

  test('Returns multiple pharmacies', () => {
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
                coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PRIMARY }],
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
                coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PREFERRED }],
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
                coding: [{ system: PHARMACY_PREFERENCE_TYPE_SYSTEM, code: PHARMACY_TYPE_PRIMARY }],
              },
            },
          ],
        },
      ],
    };
    expect(getPreferredPharmaciesFromPatient(patient)).toEqual([]);
  });

  test('Returns pharmacy without type as non-primary', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [{ url: 'pharmacy', valueReference: { reference: 'Organization/123' } }],
        },
      ],
    };
    const result = getPreferredPharmaciesFromPatient(patient);
    expect(result).toHaveLength(1);
    expect(result[0].isPrimary).toBe(false);
  });

  test('Matches primary regardless of system by default', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            { url: 'pharmacy', valueReference: { reference: 'Organization/123' } },
            {
              url: 'type',
              valueCodeableConcept: { coding: [{ system: 'https://any-vendor.com', code: PHARMACY_TYPE_PRIMARY }] },
            },
          ],
        },
      ],
    };
    const result = getPreferredPharmaciesFromPatient(patient);
    expect(result).toHaveLength(1);
    expect(result[0].isPrimary).toBe(true);
  });

  test('Ignores type with wrong system when explicit system is provided', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            { url: 'pharmacy', valueReference: { reference: 'Organization/123' } },
            {
              url: 'type',
              valueCodeableConcept: { coding: [{ system: 'https://wrong-system.com', code: PHARMACY_TYPE_PRIMARY }] },
            },
          ],
        },
      ],
    };
    const result = getPreferredPharmaciesFromPatient(patient, PHARMACY_PREFERENCE_TYPE_SYSTEM);
    expect(result).toHaveLength(1);
    expect(result[0].isPrimary).toBe(false);
  });

  test('Skips extensions without nested extensions', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [{ url: PATIENT_PREFERRED_PHARMACY_URL, valueString: 'invalid' }],
    };
    expect(getPreferredPharmaciesFromPatient(patient)).toEqual([]);
  });
});

describe('createPreferredPharmacyExtension', () => {
  test('Creates primary pharmacy extension', () => {
    const orgRef: Reference<Organization> = { reference: 'Organization/123' };
    const extension = createPreferredPharmacyExtension(orgRef, true);
    expect(extension.url).toBe(PATIENT_PREFERRED_PHARMACY_URL);
    expect(extension.extension).toHaveLength(2);
    const typeExt = extension.extension?.find((e) => e.url === 'type');
    expect(typeExt?.valueCodeableConcept?.coding?.[0].code).toBe(PHARMACY_TYPE_PRIMARY);
  });

  test('Creates preferred pharmacy extension', () => {
    const orgRef: Reference<Organization> = { reference: 'Organization/456' };
    const extension = createPreferredPharmacyExtension(orgRef, false);
    expect(extension.url).toBe(PATIENT_PREFERRED_PHARMACY_URL);
    const typeExt = extension.extension?.find((e) => e.url === 'type');
    expect(typeExt?.valueCodeableConcept?.coding?.[0].code).toBe(PHARMACY_TYPE_PREFERRED);
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
    const result = addPreferredPharmacyToPatient(patient, { reference: 'Organization/new' }, true);
    expect(result.extension).toHaveLength(2);
    const existingPharmacy = result.extension?.find((ext) => {
      return ext.extension?.find((e) => e.url === 'pharmacy')?.valueReference?.reference === 'Organization/existing';
    });
    const existingType = existingPharmacy?.extension?.find((e) => e.url === 'type');
    expect(existingType?.valueCodeableConcept?.coding?.[0].code).toBe(PHARMACY_TYPE_PREFERRED);
  });
});

describe('removePreferredPharmacyFromPatient', () => {
  test('Returns patient unchanged when no extensions', () => {
    const patient: Patient = { resourceType: 'Patient' };
    const result = removePreferredPharmacyFromPatient(patient, { reference: 'Organization/123' });
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
    const result = removePreferredPharmacyFromPatient(patient, { reference: 'Organization/123' });
    expect(result.extension).toHaveLength(0);
  });
});

describe('isOrganizationArray', () => {
  test('Returns true for empty array', () => {
    expect(isOrganizationArray([])).toBe(true);
  });

  test('Returns true for array of Organizations', () => {
    expect(isOrganizationArray([{ resourceType: 'Organization', name: 'Test' }])).toBe(true);
  });

  test('Returns false for non-array', () => {
    expect(isOrganizationArray('string')).toBe(false);
    expect(isOrganizationArray(null)).toBe(false);
    expect(isOrganizationArray(undefined)).toBe(false);
  });

  test('Returns false for array of non-Organizations', () => {
    expect(isOrganizationArray([{ resourceType: 'Patient' }])).toBe(false);
  });
});

describe('isAddPharmacyResponse', () => {
  test('Returns true for valid response', () => {
    expect(isAddPharmacyResponse({ success: true, message: 'ok' })).toBe(true);
  });

  test('Returns false for invalid response', () => {
    expect(isAddPharmacyResponse(null)).toBe(false);
    expect(isAddPharmacyResponse({})).toBe(false);
    expect(isAddPharmacyResponse({ success: 'true', message: 'ok' })).toBe(false);
  });
});
