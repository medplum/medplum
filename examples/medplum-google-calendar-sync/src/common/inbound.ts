// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import { randomUUID } from 'node:crypto';
import type { CalendarConnection } from './connection';
import { readConnection, updateConnection } from './connection';
import { EVENT_PROPERTY, SECRET } from './constants';
import { deleteCredential, MissingCalendarCredentialError, needsReconnect, readCredential } from './credentials';
import { GoogleApiError, GoogleCalendarClient } from './google-calendar';
import { getOAuthClient, refreshAccessToken, revokeToken } from './google-oauth';
import { importBusyTime, importedSlots } from './import';
import type { ConnectionLease } from './lease';
import { withConnectionLease } from './lease';
import { toGoogleEventId } from './mapping';
import { ownershipStore } from './ownership';
import { deletePublicStatus } from './public-status';
import { defaultSyncRange } from './range-sync';
import { readState, withState } from './state';
import { ifMatch } from './versioning';
import { ensureWatch } from './watch';

class InboundPending extends Error {}

/** Backoff after a failed import, so the minute recovery sweep does not refetch the snapshot every minute. */
const INBOUND_ERROR_RETRY_MS = 15 * 60_000;

async function beforeInboundWrite(lease: ConnectionLease): Promise<void> {
  await lease.check();
  if (Date.now() >= lease.deadline - 60_000) {
    await lease.mutate((basic) =>
      withState(basic, { ...readState(basic), inboundRequest: randomUUID(), inboundError: 'inbound-pending' })
    );
    throw new InboundPending('Calendar import will resume in the next delivery');
  }
}

export async function runInbound(medplum: MedplumClient, event: BotEvent, id: string): Promise<void> {
  await withConnectionLease(medplum, id, async (lease) => {
    const connection = readConnection(await lease.read());
    if (!connection) {
      throw new Error('Invalid calendar connection');
    }
    if (connection.status === 'reauth-required') {
      return;
    }
    const state = readState(connection.basic);
    if (connection.status === 'disconnecting' && state.inboundError === 'reauth-required' && !state.forgetRevoked) {
      // Await explicit acknowledgement; release can still publish the pending summary.
      return;
    }
    if (
      connection.status === 'active' &&
      state.statusPublishPending &&
      state.inboundRequest === state.inboundCompleted
    ) {
      // Lease release republishes the summary; no Google work is outstanding.
      return;
    }
    if (Date.parse(state.inboundRetryAt ?? '') > Date.now()) {
      return;
    }
    const inboundRequestAtStart = state.inboundRequest;
    let importing = false;
    try {
      if (connection.status === 'disconnecting') {
        await cleanupConnection(lease, event.secrets, connection);
        return;
      }
      importing = true;
      const access = await refreshAccessToken(getOAuthClient(event.secrets), await readCredential(medplum, connection));
      const calendar = new GoogleCalendarClient(access.access_token, { beforeRequest: () => lease.check() });
      const address = event.secrets?.[SECRET.webhookUrl]?.valueString;
      if (!address) {
        throw new Error('Missing installed Google Calendar webhook address');
      }
      // The snapshot does not depend on the watch: keep importing while notifications are unavailable.
      let watchRetryAt = Date.parse(state.watchRetryAt ?? '') > Date.now() ? state.watchRetryAt : undefined;
      if (!watchRetryAt) {
        try {
          await ensureWatch(lease, calendar, address);
        } catch (err) {
          // Do not log the exception: provider errors may contain private event data.
          console.warn('Calendar watch registration failed; importing without notifications');
          const retryAt =
            (err instanceof GoogleApiError ? err.retryAt : undefined) ?? Date.now() + INBOUND_ERROR_RETRY_MS;
          watchRetryAt = new Date(retryAt).toISOString();
          await lease.check();
        }
      }
      const range = defaultSyncRange(new Date());
      await importBusyTime(medplum, calendar, connection, range, () => beforeInboundWrite(lease));
      await lease.mutate((basic) => {
        const state = readState(basic);
        state.lastInbound = new Date().toISOString();
        state.inboundCompleted = inboundRequestAtStart;
        state.inboundError = undefined;
        state.inboundRetryAt = undefined;
        state.watchRetryAt = watchRetryAt;
        state.staleReason = watchRetryAt ? 'watch-unavailable' : undefined;
        return withState(basic, state);
      });
    } catch (err) {
      if (err instanceof InboundPending) {
        return;
      }
      const revoked = needsReconnect(err);
      if (revoked && connection.status === 'active') {
        await updateConnection(medplum, connection, { status: 'reauth-required' }, lease);
      }
      await lease.mutate((basic) => {
        const current = readState(basic);
        let retryAt = err instanceof GoogleApiError ? err.retryAt : undefined;
        if (!retryAt && connection.status === 'disconnecting' && current.cleanupIssue) {
          retryAt = Date.now() + 60 * 60_000;
        }
        if (!retryAt && !revoked && importing) {
          // The snapshot was not committed; back off rather than refetch it on every minute sweep.
          retryAt = Date.now() + INBOUND_ERROR_RETRY_MS;
        }
        return withState(basic, {
          ...current,
          inboundError: revoked ? 'reauth-required' : 'inbound-error',
          inboundRetryAt: retryAt ? new Date(retryAt).toISOString() : undefined,
        });
      });
      // Revocation is durable state; do not retry the same invalid credential indefinitely.
      if (!revoked) {
        throw err;
      }
    }
  });
}

async function cleanupConnection(
  lease: ConnectionLease,
  secrets: BotEvent['secrets'],
  connection: CalendarConnection
): Promise<void> {
  const medplum = lease.medplum;
  let state = readState(await lease.read());
  let cleanupIssue: string | undefined;
  if (!state.googleCleaned) {
    let token: string | undefined;
    try {
      token = (await refreshAccessToken(getOAuthClient(secrets), await readCredential(medplum, connection)))
        .access_token;
    } catch (err) {
      if (!(needsReconnect(err) && state.forgetRevoked)) {
        throw err;
      }
    }
    if (token) {
      const calendar = new GoogleCalendarClient(token, { beforeRequest: () => lease.check() });
      for (const channel of state.channels) {
        if (channel.resourceId) {
          try {
            await calendar.stopChannel(channel.id, channel.resourceId);
          } catch (err) {
            if (!(err instanceof GoogleApiError && err.isNotFound)) {
              throw err;
            }
          }
        }
      }
      const project = connection.basic.meta?.project;
      if (!project) {
        throw new Error('Connection has no project');
      }
      const events = await calendar.listEvents([`${EVENT_PROPERTY.project}=${project}`]);
      for (const event of events) {
        await beforeInboundWrite(lease);
        const props = event.extendedProperties?.private;
        if (!props?.[EVENT_PROPERTY.connection]) {
          cleanupIssue ??= 'legacy-mirror-repair-required';
          continue;
        }
        if (props[EVENT_PROPERTY.connection] !== connection.basic.id) {
          const desiredIdentity = {
            ...event,
            extendedProperties: { private: { ...props, [EVENT_PROPERTY.connection]: connection.basic.id } },
          };
          if (
            !(await ownershipStore(lease, connection).ownsPrevious?.(desiredIdentity, props[EVENT_PROPERTY.connection]))
          ) {
            continue;
          }
        }
        const source = props[EVENT_PROPERTY.source]?.match(/^(Appointment|Slot)\/([A-Za-z0-9.-]+)$/);
        if (!source || toGoogleEventId(source[2]) !== event.id) {
          cleanupIssue ??= 'mirror-identity-repair-required';
          continue;
        }
        if (props[EVENT_PROPERTY.connection] === connection.basic.id) {
          await ownershipStore(lease, connection).remember(event);
        }
        await calendar.deleteOwnedEvent(event.id, {
          ...props,
          [EVENT_PROPERTY.project]: project,
          [EVENT_PROPERTY.connection]: props[EVENT_PROPERTY.connection],
        });
      }
    }
    await lease.mutate((basic) =>
      withState(basic, {
        ...readState(basic),
        googleCleaned: !cleanupIssue,
        cleanupIssue,
        channels: [],
      })
    );
  }
  state = readState(await lease.read());
  if (state.googleCleaned && !state.credentialRevoked) {
    try {
      await revokeToken(await readCredential(medplum, connection));
    } catch (err) {
      // An explicit forget accepts that a missing token cannot be revoked.
      if (!(err instanceof MissingCalendarCredentialError && state.forgetRevoked)) {
        throw err;
      }
    }
    await lease.mutate((basic) => withState(basic, { ...readState(basic), credentialRevoked: true }));
    state = readState(await lease.read());
  }
  if (!state.slotsCleaned) {
    // Unassignable rows remain in place with a project-level repair diagnostic.
    // Guessing ownership from a Schedule would be unsafe after reassignment.
    for (const slot of await importedSlots(medplum, connection.basic.id)) {
      await beforeInboundWrite(lease);
      await medplum.deleteResource('Slot', slot.id, ifMatch(slot));
    }
    await lease.mutate((basic) => withState(basic, { ...readState(basic), slotsCleaned: true }));
  }
  if (cleanupIssue) {
    throw new Error('Uncertain mirrors remain; repair their ownership before completing disconnect');
  }
  await lease.check();
  // Retain account-bound ownership evidence across disconnect; it contains no token or event content.
  await deleteCredential(lease);
  await deletePublicStatus(medplum, lease.id);
  // If revocation succeeded but deletion fails, cleanup checkpoints allow retry without an access token.
  const current = await lease.read();
  await medplum.deleteResource('Basic', current.id, ifMatch(current));
}
