// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { deletePublicStatus } from './public-status';
import { projectQuery } from './project';
import { ownershipStore } from './ownership';
import { deleteCredential, readCredential } from './credentials';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { readConnection, updateConnection } from './connection';
import type { CalendarConnection } from './connection';
import { EVENT_PROPERTY, SECRET } from './constants';
import { GoogleCalendarClient, GoogleApiError } from './google-calendar';
import { getOAuthClient, GoogleOAuthError, refreshAccessToken, revokeToken } from './google-oauth';
import { findConflicts, importedSlots, importBusyTime } from './import';
import type { ConnectionLease } from './lease';
import { ifMatch, withConnectionLease } from './lease';
import { MIRRORED_APPOINTMENT_STATUSES, toGoogleEventId } from './mapping';
import { parseSyncRange } from './range-sync';
import { readState, withState } from './state';
import { ensureWatch } from './watch';

class InboundPending extends Error {}

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
    if (Date.parse(readState(connection.basic).inboundRetryAt ?? '') > Date.now()) {
      return;
    }
    const inboundRequestAtStart = readState(connection.basic).inboundRequest;
    try {
      if (connection.status === 'disconnecting') {
        await cleanupConnection(lease, event.secrets, connection);
        return;
      }
      const access = await refreshAccessToken(getOAuthClient(event.secrets), await readCredential(medplum, connection));
      const calendar = new GoogleCalendarClient(access.access_token, { beforeRequest: () => lease.check() });
      const address = event.secrets?.[SECRET.webhookUrl]?.valueString;
      if (!address) {
        throw new Error('Missing installed Google Calendar webhook address');
      }
      await ensureWatch(lease, calendar, address);
      const now = new Date();
      const range = parseSyncRange(undefined, undefined, now);
      const result = await importBusyTime(medplum, calendar, connection, range, () => beforeInboundWrite(lease));
      const actors = new Set([connection.practitionerRef]);
      for await (const page of medplum.searchResourcePages(
        'PractitionerRole',
        await projectQuery(medplum, {
          practitioner: connection.practitionerRef,
          _count: '200',
        })
      )) {
        for (const role of page) {
          actors.add(`PractitionerRole/${role.id}`);
        }
      }
      const appointments: Appointment[] = [];
      if (result.schedules.length) {
        for await (const page of medplum.searchResourcePages(
          'Appointment',
          await projectQuery(medplum, {
            actor: [...actors].join(','),
            status: [...MIRRORED_APPOINTMENT_STATUSES].join(','),
            end: `gt${range.start.toISOString()}`,
            date: `lt${range.end.toISOString()}`,
            _count: '200',
          })
        )) {
          appointments.push(...page);
          await lease.check();
        }
      }
      const conflicts = findConflicts(
        connection.basic.id,
        result.calendarId,
        result.intervals,
        result.schedules.map((s) => `Schedule/${s.id}`),
        appointments,
        actors,
        now
      );
      await lease.mutate((basic) => {
        const state = readState(basic);
        if (JSON.stringify(state.conflicts) !== JSON.stringify(conflicts)) {
          state.conflictsRevision = randomUUID();
        }
        state.conflicts = conflicts;
        state.lastInbound = new Date().toISOString();
        state.inboundCompleted = inboundRequestAtStart;
        state.inboundError = undefined;
        state.inboundRetryAt = undefined;
        state.staleReason = undefined;
        return withState(basic, state);
      });
    } catch (err) {
      if (err instanceof InboundPending) {
        return;
      }
      const revoked = err instanceof GoogleOAuthError && err.isInvalidGrant;
      if (revoked && connection.status === 'active') {
        await updateConnection(medplum, connection, { status: 'reauth-required' }, lease);
      }
      await lease.mutate((basic) =>
        withState(basic, {
          ...readState(basic),
          inboundError: revoked ? 'reauth-required' : 'inbound-error',
          inboundRetryAt:
            err instanceof GoogleApiError && err.retryAt ? new Date(err.retryAt).toISOString() : undefined,
        })
      );
      // Revocation is durable state; do not retry the same invalid credential indefinitely.
      if (!revoked) {
        throw err;
      }
    }
  });
}

export async function cleanupConnection(
  lease: ConnectionLease,
  secrets: BotEvent['secrets'],
  connection: CalendarConnection
): Promise<void> {
  const medplum = lease.medplum;
  let state = readState(await lease.read());
  let legacyPending = false;
  if (!state.googleCleaned) {
    let token: string | undefined;
    try {
      token = (await refreshAccessToken(getOAuthClient(secrets), await readCredential(medplum, connection)))
        .access_token;
    } catch (err) {
      if (!(err instanceof GoogleOAuthError && err.isInvalidGrant && state.forgetRevoked)) {
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
          legacyPending = true;
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
          throw new Error('Invalid mirror identity');
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
        googleCleaned: !legacyPending,
        cleanupIssue: legacyPending ? 'legacy-mirror-repair-required' : undefined,
        channels: [],
      })
    );
  }
  state = readState(await lease.read());
  if (state.googleCleaned && !state.credentialRevoked) {
    await revokeToken(await readCredential(medplum, connection));
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
  if (legacyPending) {
    throw new Error('Legacy mirrors remain; run the ownership migration and resume disconnect');
  }
  await lease.check();
  if (!state.credentialRevoked) {
    await revokeToken(await readCredential(medplum, connection));
    await lease.mutate((basic) => withState(basic, { ...readState(basic), credentialRevoked: true }));
  }
  // Retain account-bound ownership evidence across disconnect; it contains no token or event content.
  await deleteCredential(lease);
  await deletePublicStatus(medplum, lease.id);
  // If revocation succeeded but deletion fails, cleanup checkpoints allow retry without an access token.
  const current = await lease.read();
  await medplum.deleteResource('Basic', current.id, ifMatch(current));
}
