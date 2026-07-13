// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';
import type { ScriptSurePharmacySpecialty } from './pharmacy-search';
import { SCRIPTSURE_DEFAULT_PHARMACY_SPECIALTIES, SCRIPTSURE_PHARMACY_SPECIALTY_OPTIONS } from './pharmacy-search';

describe('pharmacy-search constants', () => {
  test('default specialties is Retail', () => {
    expect(SCRIPTSURE_DEFAULT_PHARMACY_SPECIALTIES).toEqual(['Retail']);
  });

  test('specialty options cover all ScriptSure specialties with labels', () => {
    const values = SCRIPTSURE_PHARMACY_SPECIALTY_OPTIONS.map((o) => o.value);
    const expected: ScriptSurePharmacySpecialty[] = [
      'Retail',
      'MailOrder',
      'TwentyFourHourStore',
      'SupportsDigitalSignature',
      'LongTermCare',
      'Specialty',
      'FaxPharmacySurescripts',
    ];
    expect(new Set(values)).toEqual(new Set(expected));
    for (const option of SCRIPTSURE_PHARMACY_SPECIALTY_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  test('specialty option values are unique', () => {
    const values = SCRIPTSURE_PHARMACY_SPECIALTY_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
