// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import { requireBotMembership } from '../common/authorization';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { receiveNotification } from '../common/watch';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<OperationOutcome | undefined> {
  await requireBotMembership(medplum, event, BOT_IDENTIFIER_VALUE.webhook);
  return receiveNotification(medplum, event.headers);
}
