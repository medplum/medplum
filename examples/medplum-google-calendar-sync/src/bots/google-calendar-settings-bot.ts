// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { requireOperationBot } from '../common/authorization';
import { readProjectCeiling } from '../common/configuration';
import { findConnection, updateConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import { operationHandler } from '../common/contracts';
import { getParam, mutationStatus, parseDetailLevel } from '../common/operations';

async function execute(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  const practitioner = await requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.settings);
  const connection = await findConnection(medplum, practitioner);
  if (!connection) {
    throw new Error('Google Calendar is not connected');
  }
  const level = parseDetailLevel(getParam(event.input, 'eventDetailLevel'));
  return mutationStatus(
    await updateConnection(medplum, connection, { eventDetailLevel: level }),
    await readProjectCeiling(medplum)
  );
}

export const handler = operationHandler('settings', execute);
