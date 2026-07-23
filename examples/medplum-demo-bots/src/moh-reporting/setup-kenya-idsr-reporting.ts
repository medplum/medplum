// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import {
  KENYA_IDSR_CODE_SYSTEM_URL,
  KENYA_IDSR_VALUE_SET_URL,
  KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL,
  KENYA_IDSR_WEEKLY_VALUE_SET_URL,
  createKenyaIdsrAccessPolicy,
  createKenyaIdsrCodeSystem,
  createKenyaIdsrValueSet,
  createKenyaIdsrWeeklyCodeSystem,
  createKenyaIdsrWeeklyValueSet,
} from './kenya-idsr';

export async function handler(medplum: MedplumClient, _event: BotEvent): Promise<boolean> {
  await medplum.upsertResource(createKenyaIdsrCodeSystem(), { url: KENYA_IDSR_CODE_SYSTEM_URL });
  await medplum.upsertResource(createKenyaIdsrValueSet(), { url: KENYA_IDSR_VALUE_SET_URL });
  await medplum.upsertResource(createKenyaIdsrWeeklyCodeSystem(), { url: KENYA_IDSR_WEEKLY_CODE_SYSTEM_URL });
  await medplum.upsertResource(createKenyaIdsrWeeklyValueSet(), { url: KENYA_IDSR_WEEKLY_VALUE_SET_URL });
  await medplum.upsertResource(createKenyaIdsrAccessPolicy(), { name: 'Kenya MOH IDSR Reporting Bot Policy' });
  return true;
}
