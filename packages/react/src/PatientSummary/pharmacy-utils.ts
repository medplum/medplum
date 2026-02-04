// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Re-export pharmacy utilities from @medplum/core for backward compatibility
export {
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
} from '@medplum/core';
export type { PreferredPharmacy } from '@medplum/core';
