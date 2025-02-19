import { Identifier } from '@medplum/fhirtypes';

export const MEDPLUM_BOT_SYSTEM = 'https://www.medplum.com/bots';

export const DOSESPOT_PATIENT_ID_SYSTEM = 'https://dosespot.com/patient-id';

export const DOSESPOT_PATIENT_SYNC_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-patient-sync-bot' };

export const DOSESPOT_IFRAME_BOT: Identifier = { system: MEDPLUM_BOT_SYSTEM, value: 'dosespot-iframe-bot' };

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
