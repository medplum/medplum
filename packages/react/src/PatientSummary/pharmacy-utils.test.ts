// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// This file verifies that pharmacy-utils re-exports from @medplum/core work correctly.
// The main tests are in @medplum/core/src/pharmacy-utils.test.ts

import {
  addPreferredPharmacyToPatient,
  createPreferredPharmacyExtension,
  DOSESPOT_ADD_PATIENT_PHARMACY_BOT,
  DOSESPOT_SEARCH_PHARMACY_BOT,
  getPreferredPharmaciesFromPatient,
  MEDPLUM_BOT_SYSTEM,
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_PREFERENCE_TYPE_SYSTEM,
  PHARMACY_TYPE_PREFERRED,
  PHARMACY_TYPE_PRIMARY,
  removePreferredPharmacyFromPatient,
} from './pharmacy-utils';
import type { PreferredPharmacy } from './pharmacy-utils';

describe('pharmacy-utils re-exports', () => {
  test('All constants are re-exported', () => {
    expect(PATIENT_PREFERRED_PHARMACY_URL).toBe('http://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy');
    expect(PHARMACY_PREFERENCE_TYPE_SYSTEM).toBe('https://dosespot.com/pharmacy-preference-type');
    expect(PHARMACY_TYPE_PRIMARY).toBe('primary');
    expect(PHARMACY_TYPE_PREFERRED).toBe('preferred');
    expect(MEDPLUM_BOT_SYSTEM).toBe('https://www.medplum.com/bots');
    expect(DOSESPOT_SEARCH_PHARMACY_BOT).toBeDefined();
    expect(DOSESPOT_ADD_PATIENT_PHARMACY_BOT).toBeDefined();
  });

  test('All functions are re-exported', () => {
    expect(typeof getPreferredPharmaciesFromPatient).toBe('function');
    expect(typeof createPreferredPharmacyExtension).toBe('function');
    expect(typeof addPreferredPharmacyToPatient).toBe('function');
    expect(typeof removePreferredPharmacyFromPatient).toBe('function');
  });

  test('PreferredPharmacy type is re-exported', () => {
    // Type check - this will fail at compile time if the type is not exported
    const pharmacy: PreferredPharmacy = {
      organizationRef: { reference: 'Organization/123' },
      isPrimary: true,
    };
    expect(pharmacy.isPrimary).toBe(true);
  });
});
