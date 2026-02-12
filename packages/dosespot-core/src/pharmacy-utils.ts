// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Identifier } from '@medplum/fhirtypes';

// DoseSpot-specific pharmacy preference type system
export const DOSESPOT_PHARMACY_PREFERENCE_TYPE_SYSTEM = 'https://dosespot.com/pharmacy-preference-type';

// Re-export generic pharmacy utilities from @medplum/core
export {
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
} from '@medplum/core';
export type { AddFavoriteParams, AddPharmacyResponse, PharmacySearchParams, PreferredPharmacy } from '@medplum/core';

// Bot system
export const MEDPLUM_BOT_SYSTEM = 'https://www.medplum.com/bots';

// DoseSpot identifier systems
export const DOSESPOT_PATIENT_ID_SYSTEM = 'https://dosespot.com/patient-id';
export const DOSESPOT_PHARMACY_ID_SYSTEM = 'https://dosespot.com/pharmacy-id';
export const DOSESPOT_CLINIC_FAVORITE_ID_SYSTEM = 'https://dosespot.com/clinic-favorite-medication-id';
export const DOSESPOT_DISPENSABLE_DRUG_ID_SYSTEM = 'https://dosespot.com/dispensable-drug-id';

// Bot identifiers - Pharmacy
export const DOSESPOT_SEARCH_PHARMACY_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-search-pharmacy-bot',
};

export const DOSESPOT_ADD_PATIENT_PHARMACY_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-add-patient-pharmacy-bot',
};

// Bot identifiers - Patient and Medications
export const DOSESPOT_PATIENT_SYNC_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-patient-sync-bot',
};

export const DOSESPOT_IFRAME_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-iframe-bot',
};

export const DOSESPOT_ADD_FAVORITE_MEDICATION_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-add-favorite-medication-bot',
};

export const DOSESPOT_GET_FAVORITE_MEDICATIONS_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-get-favorite-medications-bot',
};

export const DOSESPOT_SEARCH_MEDICATIONS_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-search-medication-bot',
};

export const DOSESPOT_MEDICATION_HISTORY_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-medication-history-bot',
};

export const DOSESPOT_PRESCRIPTIONS_SYNC_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-prescriptions-sync-bot',
};

export const DOSESPOT_NOTIFICATION_COUNTS_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-notification-counts-bot',
};

// DoseSpot notification response type
export interface DoseSpotNotificationCountsResponse {
  PendingPrescriptionsCount: number;
  PendingRxChangeCount: number;
  RefillRequestsCount: number;
  TransactionErrorsCount: number;
}
