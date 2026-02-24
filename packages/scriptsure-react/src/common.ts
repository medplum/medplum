// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Identifier } from '@medplum/fhirtypes';

export const MEDPLUM_BOT_SYSTEM = 'https://www.medplum.com/bots';

export const SCRIPTSURE_IFRAME_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'scriptsure-iframe-bot',
};

export const SCRIPTSURE_PATIENT_SYNC_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'scriptsure-patient-sync-bot',
};

export const SCRIPTSURE_PATIENT_ID_SYSTEM = 'https://scriptsure.com/patient-id';
