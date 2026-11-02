// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { requireBotMembership } from '../common/authorization';
import { refreshConflicts } from '../common/conflicts';
import { findConnection, readConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import { withConnectionLease } from '../common/lease';
import { requestSync } from '../common/state';
import type { SyncSource } from '../common/sync';
import { getProjectId, isResourceGone, SyncSession } from '../common/sync';

/*
 * Subscription handler for `Appointment` and `Slot`. Deliveries aren't ordered and the
 * payload is the version that triggered them, so the current version is re-read and the
 * payload only used when the resource is gone. A delete payload is verified the same way:
 * only a resource Medplum no longer has is treated as deleted, so neither a transient read
 * failure nor a forged `{ deletedResource }` can remove a live event.
 */

type SyncResource = Appointment | Slot;
export type SyncBotInput = SyncResource | { deletedResource: SyncResource };

function isSyncResource(value: unknown): value is SyncResource {
  const resourceType = (value as { resourceType?: string } | undefined)?.resourceType;
  return resourceType === 'Appointment' || resourceType === 'Slot';
}

/**
 * Resolves what to mirror: the current version when it still exists, otherwise the last
 * version as a deletion. Transient and permission errors propagate; only 404/410 means gone.
 * @param medplum - The client.
 * @param input - The Subscription payload.
 * @returns The source, or undefined for an unrecognised payload.
 */
export async function resolveSource(medplum: MedplumClient, input: SyncBotInput): Promise<SyncSource | undefined> {
  const delivered = 'deletedResource' in input ? input.deletedResource : input;
  if (!isSyncResource(delivered) || !delivered.id) {
    return undefined;
  }
  try {
    return {
      resource: await medplum.readResource(delivered.resourceType, delivered.id, { cache: 'no-cache' }),
      deleted: false,
    };
  } catch (err) {
    if (isResourceGone(err)) {
      return { resource: delivered, deleted: true };
    }
    throw err;
  }
}

export async function handler(medplum: MedplumClient, event: BotEvent<SyncBotInput>): Promise<void> {
  await requireBotMembership(medplum, event, BOT_IDENTIFIER_VALUE.sync);
  const source = await resolveSource(medplum, event.input);
  if (!source) {
    console.log('Ignoring payload that is not an Appointment or Slot');
    return;
  }

  const session = new SyncSession(medplum, event.secrets, getProjectId(source.resource));
  const results = await session.syncSource(source);
  const label = `${source.resource.resourceType}/${source.resource.id}${source.deleted ? ' (deleted)' : ''}`;
  for (const result of results) {
    console.log(`${label} → ${result.practitionerRef}: ${result.outcome}${result.error ? ` (${result.error})` : ''}`);
  }

  for (const result of results.filter((r) => r.outcome === 'error' || r.outcome === 'unmappable')) {
    const connection = await findConnection(medplum, result.practitionerRef);
    if (connection?.status === 'active') {
      await requestSync(medplum, connection.basic.id, ['outbound']);
    }
  }

  if (source.resource.resourceType === 'Appointment') {
    for (const result of results) {
      const connection = await findConnection(medplum, result.practitionerRef);
      if (connection?.status === 'active') {
        try {
          await withConnectionLease(medplum, connection.basic.id, async (lease) => {
            const current = readConnection(await lease.read());
            if (current?.status === 'active') {
              await refreshConflicts(lease, current);
            }
          });
        } catch {
          // A busy worker or failed local refresh must leave durable work for this recipient.
          await requestSync(medplum, connection.basic.id, ['inbound']);
        }
      }
    }
  }

  const failures = results.filter((r) => r.outcome === 'error');
  if (failures.length > 0) {
    throw new Error(`${label}: ${failures.length} of ${results.length} practitioners failed to sync`);
  }
}
