// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { operationHandler } from '../common/contracts';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import { requireOperationBot } from '../common/authorization';
import { findConnection, updateConnection } from '../common/connection';
import { getParam, parseDetailLevel, mutationStatus } from '../common/operations';

async function execute(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  const practitioner = await requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.settings);
  const connection = await findConnection(medplum, practitioner);
  if (!connection) {
    throw new Error('Google Calendar is not connected');
  }
  const level = parseDetailLevel(getParam(event.input, 'eventDetailLevel'));
  return mutationStatus(await updateConnection(medplum, connection, { eventDetailLevel: level }));
}

export const handler = operationHandler('settings', execute);
