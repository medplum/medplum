// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { operationHandler } from '../common/contracts';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { findConnection, readConnection } from '../common/connection';
import { GOOGLE_CALENDAR_NAMESPACE, BOT_IDENTIFIER_VALUE } from '../common/constants';
import { withConnectionLease } from '../common/lease';
import { requireOperationBot } from '../common/authorization';
import { mutationStatus } from '../common/operations';
import { readState, withState } from '../common/state';

async function execute(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  const connection = await findConnection(
    medplum,
    await requireOperationBot(medplum, event, BOT_IDENTIFIER_VALUE.disconnect)
  );
  if (!connection) {
    return mutationStatus(undefined);
  }
  const forget = event.input?.parameter?.some((p) => p.name === 'forgetRevoked' && p.valueBoolean === true) === true;
  await withConnectionLease(medplum, connection.basic.id, async (lease) => {
    await lease.mutate((basic) => {
      const current = readConnection(basic);
      const state = readState(basic);
      if ((current?.status === 'reauth-required' || state.inboundError === 'reauth-required') && !forget) {
        throw new Error('Reconnect for cleanup, or explicitly set forgetRevoked=true to leave residual Google events');
      }
      state.forgetRevoked = forget;
      state.inboundRequest = randomUUID();
      const statusUrl = `${GOOGLE_CALENDAR_NAMESPACE}/status`;
      return withState(
        {
          ...basic,
          extension: [
            ...(basic.extension ?? []).filter((e) => e.url !== statusUrl),
            { url: statusUrl, valueCode: 'disconnecting' },
          ],
        },
        state
      );
    });
  });
  return mutationStatus(await findConnection(medplum, connection.practitionerRef));
}

export const handler = operationHandler('disconnect', execute);
