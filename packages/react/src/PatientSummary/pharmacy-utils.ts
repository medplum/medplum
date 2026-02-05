// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Re-export pharmacy utilities from @medplum/dosespot-core for backward compatibility
export {
  DOSESPOT_ADD_PATIENT_PHARMACY_BOT,
  DOSESPOT_SEARCH_PHARMACY_BOT,
  MEDPLUM_BOT_SYSTEM,
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_PREFERENCE_TYPE_SYSTEM,
  PHARMACY_TYPE_PREFERRED,
  PHARMACY_TYPE_PRIMARY,
  addPreferredPharmacyToPatient,
  createPreferredPharmacyExtension,
  getPreferredPharmaciesFromPatient,
  removePreferredPharmacyFromPatient,
} from '@medplum/dosespot-core';
export type { PreferredPharmacy } from '@medplum/dosespot-core';
