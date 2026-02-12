// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// This file verifies that pharmacy-utils re-exports from @medplum/core work correctly.
// The main tests are in @medplum/core/src/pharmacy-utils.test.ts

import { HTTP_HL7_ORG } from '@medplum/core';
import type { AddFavoriteParams, AddPharmacyResponse, PharmacySearchParams, PreferredPharmacy } from './pharmacy-utils';
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

describe('pharmacy-utils re-exports from @medplum/core', () => {
  test('All constants are re-exported', () => {
    expect(PATIENT_PREFERRED_PHARMACY_URL).toBe(`${HTTP_HL7_ORG}/fhir/StructureDefinition/patient-preferredPharmacy`);
    expect(PHARMACY_PREFERENCE_TYPE_SYSTEM).toBe('https://medplum.com/fhir/CodeSystem/pharmacy-preference-type');
    expect(PHARMACY_TYPE_PRIMARY).toBe('primary');
    expect(PHARMACY_TYPE_PREFERRED).toBe('preferred');
  });

  test('All functions are re-exported', () => {
    expect(typeof getPreferredPharmaciesFromPatient).toBe('function');
    expect(typeof createPreferredPharmacyExtension).toBe('function');
    expect(typeof addPreferredPharmacyToPatient).toBe('function');
    expect(typeof removePreferredPharmacyFromPatient).toBe('function');
    expect(typeof isOrganizationArray).toBe('function');
    expect(typeof isAddPharmacyResponse).toBe('function');
  });

  test('PreferredPharmacy type is re-exported', () => {
    const pharmacy: PreferredPharmacy = {
      organizationRef: { reference: 'Organization/123' },
      isPrimary: true,
    };
    expect(pharmacy.isPrimary).toBe(true);
  });

  test('PharmacySearchParams type is re-exported', () => {
    const params: PharmacySearchParams = { name: 'Test', city: 'Boston' };
    expect(params.name).toBe('Test');
  });

  test('AddFavoriteParams type is re-exported', () => {
    const params: AddFavoriteParams = {
      patientId: '123',
      pharmacy: { resourceType: 'Organization', name: 'Test' },
      setAsPrimary: true,
    };
    expect(params.patientId).toBe('123');
  });

  test('AddPharmacyResponse type is re-exported', () => {
    const response: AddPharmacyResponse = { success: true, message: 'ok' };
    expect(response.success).toBe(true);
  });
});
