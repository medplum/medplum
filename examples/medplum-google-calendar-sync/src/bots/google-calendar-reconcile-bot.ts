// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { PractitionerRole, Resource, Schedule } from '@medplum/fhirtypes';
import { requireBotMembership } from '../common/authorization';
import { CONNECTION_SEARCH, findConnection, readConnection } from '../common/connection';
import { BOT_IDENTIFIER_SYSTEM, BOT_IDENTIFIER_VALUE, INSTALL_SYSTEM } from '../common/constants';
import { LEASE_URL } from '../common/lease';
import { assertCurrentProject, projectQuery } from '../common/project';
import { parseSyncRange, syncRange } from '../common/range-sync';
import { readState, repairCheckpoint, requestSync } from '../common/state';
import { getProjectId, SyncSession } from '../common/sync';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  await requireBotMembership(medplum, event, BOT_IDENTIFIER_VALUE.reconcile);
  const input = event.input as Resource | undefined;
  const delivered = (event.input as { deletedResource?: Resource } | undefined)?.deletedResource ?? input;
  if (delivered?.resourceType === 'Schedule' || delivered?.resourceType === 'PractitionerRole') {
    if (!delivered.id) {
      throw new Error('Missing scheduling resource ID');
    }
    const practitioners = new Set<string>();
    const roles = new Set<string>();
    const collect = (resource: Schedule | PractitionerRole): void => {
      const refs = resource.resourceType === 'Schedule' ? resource.actor : [resource.practitioner];
      for (const ref of refs) {
        if (ref?.reference?.startsWith('Practitioner/')) {
          practitioners.add(ref.reference);
        }
        if (ref?.reference?.startsWith('PractitionerRole/')) {
          roles.add(ref.reference.slice('PractitionerRole/'.length));
        }
      }
    };
    // Read authoritative history so reassignment includes former actors, even after a delete.
    const history = async (type: 'Schedule' | 'PractitionerRole', id: string): Promise<void> => {
      for (let offset = 0; ; offset += 100) {
        const page = await medplum.readHistory(type, id, { count: 100, offset });
        const entries = page.entry ?? [];
        for (const entry of entries) {
          if (entry.resource) {
            await assertCurrentProject(medplum, entry.resource);
            collect(entry.resource);
          }
        }
        if (entries.length < 100) {
          break;
        }
      }
    };
    await history(delivered.resourceType, delivered.id);
    for (const role of roles) {
      await history('PractitionerRole', role);
    }
    for (const practitioner of practitioners) {
      const connection = await findConnection(medplum, practitioner);
      if (connection?.status === 'active') {
        await requestSync(medplum, connection.basic.id, ['inbound', 'outbound']);
      }
    }
    return;
  }

  if (input?.resourceType === 'Basic' && input.id) {
    const connection = readConnection(await medplum.readResource('Basic', input.id, { cache: 'no-cache' }));
    if (connection?.status !== 'active') {
      return;
    }
    const counts = await syncRange(
      new SyncSession(medplum, event.secrets, getProjectId(connection.basic)),
      connection,
      parseSyncRange(undefined, undefined, new Date()),
      true
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
          const state = readState(repairCheckpoint(basic));
          const directions: ('inbound' | 'outbound')[] = [];
          if (
            state.statusPublishPending ||
            (connection.status === 'disconnecting' &&
              (state.inboundError !== 'reauth-required' || state.forgetRevoked)) ||
            (connection.status === 'active' &&
              (state.inboundRequest !== state.inboundCompleted || state.conflictsPending))
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
                value: direction === 'inbound' ? BOT_IDENTIFIER_VALUE.inbound : BOT_IDENTIFIER_VALUE.reconcile,
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
  // Each worker handles at most 100 connections. One practitioner's Google API work never
  // consumes another practitioner's dispatch time budget.
  for await (const page of medplum.searchResourcePages(
    'Basic',
    await projectQuery(medplum, `${CONNECTION_SEARCH}&_count=100`)
  )) {
    const ids = page
      .filter(
        (b) =>
          ['active', 'disconnecting'].includes(readConnection(b)?.status ?? '') ||
          readState(repairCheckpoint(b)).statusPublishPending
      )
      .map((b) => b.id);
    if (ids.length) {
      await medplum.executeBot(
        { system: BOT_IDENTIFIER_SYSTEM, value: BOT_IDENTIFIER_VALUE.reconcile },
        { connectionIds: ids, retry },
        'application/json',
        { headers: { Prefer: 'respond-async' } }
      );
    }
  }
}
