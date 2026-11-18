// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { normalizeErrorString } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import type { CalendarConnection } from './connection';
import { GoogleApiError } from './google-calendar';
import { MIRRORED_APPOINTMENT_STATUSES } from './mapping';
import { projectQuery } from './project';
import type { SyncSession, SyncSource } from './sync';
import { isResourceGone } from './sync';

/*
 * Pushes everything a practitioner should have on their calendar within a date range:
 * the backfill on connect and the hourly repair.
 * Then verifies every existing owned mirror, independently of the discovery horizon.
 */

/** How far ahead the backfill on connect and the hourly repair discover. */
const DEFAULT_SYNC_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SyncRange {
  start: Date;
  end: Date;
}

/**
 * The window both directions discover and repair.
 * @param now - The reference time.
 * @returns From now to `DEFAULT_SYNC_DAYS` ahead.
 */
export function defaultSyncRange(now: Date): SyncRange {
  return { start: now, end: new Date(now.getTime() + DEFAULT_SYNC_DAYS * DAY_MS) };
}

/**
 * Upserts every mirrorable Appointment and blocked Slot naming the practitioner that
 * overlaps the range. Each candidate is re-read before it's written, so a change since the
 * search wins; one failure never stops the rest.
 * @param session - The sync session for this project.
 * @param connection - The practitioner's active connection.
 * @param range - The date range.
 * @returns How many candidates were found, and a count per outcome.
 */
export async function syncRange(
  session: SyncSession,
  connection: CalendarConnection,
  range: SyncRange
): Promise<Record<string, number>> {
  return session.withConnection(connection, async (current) => {
    if (current.status !== 'active') {
      throw new Error('Calendar connection is not active');
    }
    try {
      const counts = await syncRangeLocked(session, current, range);
      if (counts.pending) {
        await session.recordOutbound(false, 'outbound-incomplete');
        return counts;
      }
      await session.recordOutbound(
        true,
        counts.errors || counts.unmappable || counts['reauth-required'] ? 'outbound-incomplete' : undefined
      );
      return counts;
    } catch (err) {
      await session.recordOutbound(false, 'outbound-error');
      throw err;
    }
  });
}

async function syncRangeLocked(
  session: SyncSession,
  connection: CalendarConnection,
  range: SyncRange
): Promise<Record<string, number>> {
  const counts: Record<string, number> = { candidates: 0, errors: 0 };
  const processed = new Map<string, string>();
  const practitionerRef = connection.practitionerRef;
  for (const candidate of await findCandidates(session, practitionerRef, range)) {
    if (session.outOfTime()) {
      return { ...counts, pending: 1 };
    }
    const ref = `${candidate.resourceType}/${candidate.id}`;
    counts.candidates++;
    try {
      const source = await currentSource(session, candidate);
      if (source && (await session.isMirroredFor(source, practitionerRef))) {
        const outcome = await session.syncForConnection(source, connection);
        counts[outcome] = (counts[outcome] ?? 0) + 1;
        if (outcome === 'reauth-required') {
          return counts;
        }
        if (outcome !== 'unmappable' && source.resource.meta?.versionId) {
          processed.set(ref, source.resource.meta.versionId);
        }
      }
    } catch (err) {
      counts.errors++;
      if (err instanceof GoogleApiError && err.retryAt) {
        throw err;
      }
      console.warn(`${practitionerRef}: ${ref}: ${normalizeErrorString(err)}`);
    }
  }
  const repairs = await session.reconcileExisting(connection, processed);
  for (const [key, count] of Object.entries(repairs)) {
    counts[key] = (counts[key] ?? 0) + count;
  }
  return counts;
}

// The search result may be stale; only the current version decides what is written.
async function currentSource(session: SyncSession, candidate: Appointment | Slot): Promise<SyncSource | undefined> {
  if (!candidate.id) {
    return undefined;
  }
  try {
    return {
      resource: await session.medplum.readResource(candidate.resourceType, candidate.id, { cache: 'no-cache' }),
      deleted: false,
    };
  } catch (err) {
    if (isResourceGone(err)) {
      return undefined;
    }
    throw err;
  }
}

// Appointments and Slots reach a practitioner directly or through a PractitionerRole, and
// the range is an overlap: ends after `start`, starts before `end`. Search params repeat
// (`end=ge…&date=le…`), which the client's object form can't express, hence the strings.
async function findCandidates(
  session: SyncSession,
  practitionerRef: string,
  range: SyncRange
): Promise<(Appointment | Slot)[]> {
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const appointments = new URLSearchParams([
    ['_filter', `actor eq ${practitionerRef} or actor:PractitionerRole.practitioner eq ${practitionerRef}`],
    ['status', [...MIRRORED_APPOINTMENT_STATUSES].join(',')],
    ['end', `ge${start}`],
    ['date', `le${end}`],
    ['_count', '200'],
  ]);
  const slots = new URLSearchParams([
    [
      '_filter',
      `schedule.actor eq ${practitionerRef} or schedule.actor:PractitionerRole.practitioner eq ${practitionerRef}`,
    ],
    ['status', 'busy-unavailable'],
    ['end', `ge${start}`],
    ['start', `le${end}`],
    ['_count', '200'],
  ]);
  const candidates: (Appointment | Slot)[] = [];
  for await (const page of session.medplum.searchResourcePages(
    'Appointment',
    await projectQuery(session.medplum, appointments.toString())
  )) {
    candidates.push(...page);
  }
  for await (const page of session.medplum.searchResourcePages(
    'Slot',
    await projectQuery(session.medplum, slots.toString())
  )) {
    candidates.push(...page);
  }
  return candidates;
}
