// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EPrescribingExtensions } from '@medplum/core';
import type { Identifier } from '@medplum/fhirtypes';

export const MEDPLUM_BOT_SYSTEM = 'https://www.medplum.com/bots';

export const SCRIPTSURE_DRUG_SEARCH_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'scriptsure-drug-search-bot',
};

export const SCRIPTSURE_ORDER_MEDICATION_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'scriptsure-order-medication-bot',
};

/** Identifier system for ScriptSure ROUTED_MED_ID on in-memory Medication resources from drug search. */
export const SCRIPTSURE_ROUTED_MED_ID_SYSTEM = 'https://scriptsure.com/routed-med-id';

export const SCRIPTSURE_PENDING_ORDER_ID_SYSTEM = 'https://scriptsure.com/pending-order-id';

export const SCRIPTSURE_PENDING_ORDER_STATUS_EXTENSION = 'https://scriptsure.com/pending-order-status';

export const SCRIPTSURE_IFRAME_URL_EXTENSION = 'https://scriptsure.com/iframe-url';

export const SCRIPTSURE_EPRESCRIBING_EXTENSIONS: EPrescribingExtensions = {
  pendingOrderIdSystem: SCRIPTSURE_PENDING_ORDER_ID_SYSTEM,
  pendingOrderStatusUrl: SCRIPTSURE_PENDING_ORDER_STATUS_EXTENSION,
  iframeUrlExtension: SCRIPTSURE_IFRAME_URL_EXTENSION,
};

export const SCRIPTSURE_IFRAME_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'scriptsure-iframe-bot',
};

export const SCRIPTSURE_PATIENT_SYNC_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'scriptsure-patient-sync-bot',
};

export const SCRIPTSURE_SEARCH_PHARMACY_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'scriptsure-search-pharmacy-bot',
};

export const SCRIPTSURE_ADD_PATIENT_PHARMACY_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'scriptsure-add-patient-pharmacy-bot',
};

export const SCRIPTSURE_PATIENT_ID_SYSTEM = 'https://scriptsure.com/patient-id';

/** Base URL for ScriptSure-specific extensions on in-memory Medication resources (e.g. `/sig`). */
export const SCRIPTSURE_SYSTEM = 'https://scriptsure.com';

/** Pre-built dosing option on a Medication from drug-format lookup (`routedMedId` search). */
export const SCRIPTSURE_SIG_EXTENSION = `${SCRIPTSURE_SYSTEM}/sig`;

/** ScriptSure MED_NAME_TYPE_CD on a search-result Medication: `'1'` = brand, `'2'` = generic. */
export const SCRIPTSURE_NAME_TYPE_EXTENSION = `${SCRIPTSURE_SYSTEM}/name-type`;

/** ScriptSure GenericName on a search-result Medication (parent generic when the row is a brand). */
export const SCRIPTSURE_GENERIC_NAME_EXTENSION = `${SCRIPTSURE_SYSTEM}/generic-name`;
