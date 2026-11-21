// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { CONNECTION_SEARCH, readConnection } from './connection';
import { BOT_IDENTIFIER_SYSTEM, BOT_IDENTIFIER_VALUE, INSTALL_SYSTEM } from './constants';
import { LEASE_URL } from './lease';
import { assertCurrentProject, projectQuery } from './project';
import { defaultSyncRange, syncRange } from './range-sync';
import { readState, requestSync } from './state';
import { getProjectId, SyncSession } from './sync';

/**
 * The worker's non-scheduling deliveries: one connection's queued outbound work, a batch of
 * connections to dispatch, or a Cron that starts a project-wide sweep.
 * @param medplum - The worker client.
 * @param event - The Bot event.
 */
export async function reconcile(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const input = event.input as Resource | undefined;
  if (input?.resourceType === 'Basic' && input.id) {
    const connection = readConnection(await medplum.readResource('Basic', input.id, { cache: 'no-cache' }));
    if (connection?.status !== 'active') {
      return;
    }
    const counts = await syncRange(
      new SyncSession(medplum, event.secrets, getProjectId(connection.basic)),
      connection,
      defaultSyncRange(new Date())
    );
    if (counts.errors || counts.unmappable) {
      throw new Error('Outbound calendar repair incomplete; retry delivery');
    }
    return;
  }
  const retry =
    (input?.resourceType === 'Cron' &&
      input.identifier?.some((i) => i.system === INSTALL_SYSTEM && i.value === 'work-cron')) ||
    (event.input as { retry?: unknown } | undefined)?.retry === true;
  const batch = (event.input as { connectionIds?: unknown } | undefined)?.connectionIds;
  if (batch !== undefined) {
    if (
      !Array.isArray(batch) ||
      batch.length > 100 ||
      !batch.every((id) => typeof id === 'string' && /^[A-Za-z0-9.-]+$/.test(id))
    ) {
      throw new Error('Invalid calendar dispatch batch');
    }
    let failed = 0;
    for (const id of batch) {
      try {
        const basic = await medplum.readResource('Basic', id, { cache: 'no-cache' });
        await assertCurrentProject(medplum, basic);
        const connection = readConnection(basic);
        if (retry && connection) {
          const expires = basic.extension
            ?.find((e) => e.url === LEASE_URL)
            ?.extension?.find((e) => e.url === 'expires')?.valueInstant;
          if (expires && Date.parse(expires) > Date.now()) {
            continue;
          }
          const state = readState(basic);
          const directions: ('inbound' | 'outbound')[] = [];
          if (
            state.statusPublishPending ||
            (connection.status === 'disconnecting' &&
              (state.inboundError !== 'reauth-required' || state.forgetRevoked)) ||
            (connection.status === 'active' && state.inboundRequest !== state.inboundCompleted)
          ) {
            directions.push('inbound');
          }
          if (connection.status === 'active' && state.outboundRequest !== state.outboundCompleted) {
            directions.push('outbound');
          }
          for (const direction of directions) {
            if (
              Date.parse(state[`${direction}RetryAt`] ?? '') > Date.now() &&
              !(direction === 'inbound' && state.statusPublishPending)
            ) {
              continue;
            }
            await medplum.executeBot(
              {
                system: BOT_IDENTIFIER_SYSTEM,
                value: direction === 'inbound' ? BOT_IDENTIFIER_VALUE.inbound : BOT_IDENTIFIER_VALUE.sync,
              },
              { resourceType: 'Basic', id },
              'application/fhir+json',
              { headers: { Prefer: 'respond-async' } }
            );
          }
        } else if (connection?.status === 'active') {
          await requestSync(medplum, id, ['inbound', 'outbound']);
        } else if (connection?.status === 'disconnecting') {
          await requestSync(medplum, id, ['inbound']);
        }
      } catch {
        failed++;
      }
    }
    if (failed) {
      throw new Error(`${failed} calendar dispatch requests failed`);
    }
    return;
  }
  if (event.input !== undefined && input?.resourceType !== 'Cron') {
    // Only a Cron starts a project-wide sweep, not a delivery from a Subscription an earlier install left behind.
    return;
  }
  // Each worker handles at most 100 connections. One practitioner's Google API work never
  // consumes another practitioner's dispatch time budget.
  for await (const page of medplum.searchResourcePages(
    'Basic',
    await projectQuery(medplum, `${CONNECTION_SEARCH}&_count=100`)
  )) {
    const ids = page
      .filter(
        (b) =>
          ['active', 'disconnecting'].includes(readConnection(b)?.status ?? '') || readState(b).statusPublishPending
      )
      .map((b) => b.id);
    if (ids.length) {
      await medplum.executeBot(
        { system: BOT_IDENTIFIER_SYSTEM, value: BOT_IDENTIFIER_VALUE.sync },
        { connectionIds: ids, retry },
        'application/json',
        { headers: { Prefer: 'respond-async' } }
      );
    }
  }
}
