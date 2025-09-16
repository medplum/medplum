// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Identifier } from '@medplum/fhirtypes';

export const MEDPLUM_BOT_SYSTEM = 'https://www.medplum.com/bots';

export const DOSESPOT_PATIENT_ID_SYSTEM = 'https://dosespot.com/patient-id';

export const DOSESPOT_CLINIC_FAVORITE_ID_SYSTEM = 'https://dosespot.com/clinic-favorite-medication-id';

export const DOSESPOT_DISPENSABLE_DRUG_ID_SYSTEM = 'https://dosespot.com/dispensable-drug-id';

export const DOSESPOT_PATIENT_SYNC_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-patient-sync-bot' };

export const DOSESPOT_IFRAME_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-iframe-bot' };

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

export interface DoseSpotNotificationCountsResponse {
  PendingPrescriptionsCount: number;
  PendingRxChangeCount: number;
  RefillRequestsCount: number;
  TransactionErrorsCount: number;
}
