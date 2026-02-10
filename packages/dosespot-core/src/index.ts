// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export {
  // Bot system
  MEDPLUM_BOT_SYSTEM,
  // DoseSpot identifier systems
  DOSESPOT_PATIENT_ID_SYSTEM,
  DOSESPOT_PHARMACY_ID_SYSTEM,
  DOSESPOT_CLINIC_FAVORITE_ID_SYSTEM,
  DOSESPOT_DISPENSABLE_DRUG_ID_SYSTEM,
  // Pharmacy extension URLs and systems (re-exported from @medplum/core)
  PATIENT_PREFERRED_PHARMACY_URL,
  PHARMACY_PREFERENCE_TYPE_SYSTEM,
  PHARMACY_TYPE_PRIMARY,
  PHARMACY_TYPE_PREFERRED,
  // Bot identifiers - Pharmacy
  DOSESPOT_SEARCH_PHARMACY_BOT,
  DOSESPOT_ADD_PATIENT_PHARMACY_BOT,
  // Bot identifiers - Patient and Medications
  DOSESPOT_PATIENT_SYNC_BOT,
  DOSESPOT_IFRAME_BOT,
  DOSESPOT_ADD_FAVORITE_MEDICATION_BOT,
  DOSESPOT_GET_FAVORITE_MEDICATIONS_BOT,
  DOSESPOT_SEARCH_MEDICATIONS_BOT,
  DOSESPOT_MEDICATION_HISTORY_BOT,
  DOSESPOT_PRESCRIPTIONS_SYNC_BOT,
  DOSESPOT_NOTIFICATION_COUNTS_BOT,
  // Pharmacy utility functions (re-exported from @medplum/core)
  addPreferredPharmacyToPatient,
  createPreferredPharmacyExtension,
  getPreferredPharmaciesFromPatient,
  removePreferredPharmacyFromPatient,
  isOrganizationArray,
  isAddPharmacyResponse,
} from './pharmacy-utils';
export type {
  PreferredPharmacy,
  DoseSpotNotificationCountsResponse,
  PharmacySearchParams,
  AddFavoriteParams,
  AddPharmacyResponse,
} from './pharmacy-utils';
