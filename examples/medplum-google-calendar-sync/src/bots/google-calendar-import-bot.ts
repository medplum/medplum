// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Basic } from '@medplum/fhirtypes';
import { requireBotMembership } from '../common/authorization';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import { runInbound } from '../common/inbound';

export async function handler(medplum: MedplumClient, event: BotEvent<Basic>): Promise<void> {
  await requireBotMembership(medplum, event, BOT_IDENTIFIER_VALUE.inbound);
  if (event.input?.resourceType !== 'Basic' || !event.input.id) {
    throw new Error('Expected a Calendar Connection');
  }
  // Only the ID selects work; credentials, status and project are always re-read under this membership.
  await runInbound(medplum, event, event.input.id);
}
