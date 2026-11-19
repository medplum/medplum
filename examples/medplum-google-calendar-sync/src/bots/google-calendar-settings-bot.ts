// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { requireOperationBot } from '../common/authorization';
import { projectCeiling } from '../common/configuration';
import { findConnection, updateConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import { operationHandler } from '../common/contracts';
import { ConnectionBusyError } from '../common/lease';
import { getParam, mutationStatus, parseDetailLevel } from '../common/operations';

async function execute(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  const practitioner = await requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.settings);
  const connection = await findConnection(medplum, practitioner);
  if (!connection) {
    throw new Error('Google Calendar is not connected');
  }
  const level = parseDetailLevel(getParam(event.input, 'eventDetailLevel'));
  try {
    return mutationStatus(
      await updateConnection(medplum, connection, { eventDetailLevel: level }),
      await projectCeiling(medplum, event.secrets)
    );
  } catch (err) {
    if (err instanceof ConnectionBusyError) {
      throw new Error('A calendar sync is running; try again in a few minutes', { cause: err });
    }
    throw err;
  }
}

export const handler = operationHandler('settings', execute);
