// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Re-export generic pharmacy utilities from @medplum/core
export {
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_PREFERENCE_TYPE_SYSTEM,
  PHARMACY_TYPE_PREFERRED,
  PHARMACY_TYPE_PRIMARY,
  addPreferredPharmacyToPatient,
  createPreferredPharmacyExtension,
  getPreferredPharmaciesFromPatient,
  removePreferredPharmacyFromPatient,
  isOrganizationArray,
  isAddPharmacyResponse,
} from '@medplum/core';
export type {
  PreferredPharmacy,
  PharmacySearchParams,
  AddFavoriteParams,
  AddPharmacyResponse,
} from '@medplum/core';
