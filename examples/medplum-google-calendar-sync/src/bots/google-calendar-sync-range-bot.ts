// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { requireOperationBot } from '../common/authorization';
import { findConnection, readConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import { operationHandler } from '../common/contracts';
import { withConnectionLease } from '../common/lease';
import { getParam } from '../common/operations';
import { parseSyncRange } from '../common/range-sync';
import { readState, withState } from '../common/state';

async function execute(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  const practitioner = await requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.syncRange);
  const range = parseSyncRange(getParam(event.input, 'start'), getParam(event.input, 'end'), new Date());
  const connection = await findConnection(medplum, practitioner);
  if (!connection) {
    throw new Error('Google Calendar is not connected; connect it first');
  }
  await withConnectionLease(medplum, connection.basic.id, async (lease) => {
    await lease.mutate((basic) => {
      if (readConnection(basic)?.status !== 'active') {
        throw new Error('Google access is paused; reconnect it first');
      }
      const state = readState(basic);
      if (state.requestedRangeStart) {
        throw new Error('A range sync is already pending; wait for completion');
      }
      state.requestedRangeStart = range.start.toISOString();
      state.requestedRangeEnd = range.end.toISOString();
      state.outboundRequest = randomUUID();
      return withState(basic, state);
    });
  });
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'queued', valueBoolean: true },
      { name: 'start', valueDateTime: range.start.toISOString() },
      { name: 'end', valueDateTime: range.end.toISOString() },
    ],
  };
}

export const handler = operationHandler('sync', execute);
