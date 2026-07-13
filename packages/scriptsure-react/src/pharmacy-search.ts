// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { PharmacySearchParams } from '@medplum/core';

/**
 * SureScripts pharmacy specialty tags accepted by POST /v3/pharmacy/search `specialties`.
 * Must stay aligned with ScriptSure API allowed values.
 */
export type ScriptSurePharmacySpecialty =
  | 'Retail'
  | 'MailOrder'
  | 'TwentyFourHourStore'
  | 'SupportsDigitalSignature'
  | 'LongTermCare'
  | 'Specialty'
  | 'FaxPharmacySurescripts';

export interface ScriptSurePharmacySpecialtyOption {
  readonly value: ScriptSurePharmacySpecialty;
  readonly label: string;
}

/** Category filters shown in the ScriptSure pharmacy search dialog. */
export const SCRIPTSURE_PHARMACY_SPECIALTY_OPTIONS: readonly ScriptSurePharmacySpecialtyOption[] = [
  { value: 'Retail', label: 'Retail' },
  { value: 'MailOrder', label: 'Mail order' },
  { value: 'TwentyFourHourStore', label: '24-hour' },
  { value: 'LongTermCare', label: 'Long-term care' },
  { value: 'Specialty', label: 'Specialty' },
  { value: 'SupportsDigitalSignature', label: 'Digital signature' },
  { value: 'FaxPharmacySurescripts', label: 'Fax (Surescripts)' },
] as const;

/** Default specialty filter for nearby retail pharmacy pickers. */
export const SCRIPTSURE_DEFAULT_PHARMACY_SPECIALTIES: readonly ScriptSurePharmacySpecialty[] = ['Retail'];

/**
 * ScriptSure pharmacy search parameters.
 * Extends the shared dialog fields with SureScripts specialty filters.
 */
export interface ScriptSurePharmacySearchParams extends PharmacySearchParams {
  specialties?: ScriptSurePharmacySpecialty[];
}
