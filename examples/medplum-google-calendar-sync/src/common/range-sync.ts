// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { projectQuery } from './project';

/*
 * Pushes everything a practitioner should have on their calendar within a date range:
 * the backfill on connect, and `Practitioner/$google-calendar-sync` on demand.
 * Then verifies every existing owned mirror, independently of the discovery horizon.
 */

import { normalizeErrorString } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import type { CalendarConnection } from './connection';
import { GoogleApiError } from './google-calendar';
import { MIRRORED_APPOINTMENT_STATUSES } from './mapping';
import type { SyncSession, SyncSource } from './sync';
import { isResourceGone } from './sync';

/** How far ahead the backfill on connect, and `$google-calendar-sync` by default, push. */
const DEFAULT_SYNC_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SyncRange {
  start: Date;
  end: Date;
}

/**
 * Validates a caller-supplied range: both instants parse, the end is after the start, and the
 * span is at most a year, so one call can't walk a whole history.
 * @param start - ISO start, or undefined for now.
 * @param end - ISO end, or undefined for 90 days after the start.
 * @param now - The reference time.
 * @returns The range.
 */
export function parseSyncRange(start: string | undefined, end: string | undefined, now: Date): SyncRange {
  const startDate = start ? new Date(start) : now;
  const endDate = end ? new Date(end) : new Date(startDate.getTime() + DEFAULT_SYNC_DAYS * DAY_MS);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('start and end must be ISO 8601 date-times');
  }
  if (endDate <= startDate) {
    throw new Error('end must be after start');
  }
  if (endDate.getTime() - startDate.getTime() > 366 * DAY_MS) {
    throw new Error('The range may span at most one year');
  }
  return { start: startDate, end: endDate };
}

/**
 * Upserts every mirrorable Appointment and blocked Slot naming the practitioner that
 * overlaps the range. Each candidate is re-read before it's written, so a change since the
 * search wins; one failure never stops the rest.
 * @param session - The sync session for this project.
 * @param connection - The practitioner's active connection.
 * @param range - The date range.
 * @param resume - Resume the durable range and cursors for a worker delivery.
 * @returns How many candidates were found, and a count per outcome.
 */
export async function syncRange(
  session: SyncSession,
  connection: CalendarConnection,
  range: SyncRange,
  resume = false
): Promise<Record<string, number>> {
  return session.withConnection(connection, async (current) => {
    if (current.status !== 'active') {
      throw new Error('Calendar connection is not active');
    }
    try {
      const work = await session.beginWork(range, resume);
      const counts = await syncRangeLocked(session, current, { start: new Date(work.start), end: new Date(work.end) });
      if (counts.pending) {
        return counts;
      }
      counts.errors = await session.finishWork();
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
  const practitionerRef = connection.practitionerRef;
  const work = await session.workState();
  if (work?.phase === 'discover') {
    const ref = (resource: Appointment | Slot): string => `${resource.resourceType}/${resource.id}`;
    const candidates = (await findCandidates(session, practitionerRef, range)).sort((a, b) =>
      ref(a).localeCompare(ref(b))
    );
    for (const candidate of candidates) {
      if (work.cursor && ref(candidate).localeCompare(work.cursor) <= 0) {
        continue;
      }
      if (await session.yieldWork()) {
        return { ...counts, pending: 1 };
      }
      counts.candidates++;
      let failed = false;
      try {
        const source = await currentSource(session, candidate);
        if (source && (await session.isMirroredFor(source, practitionerRef))) {
          const outcome = await session.syncForConnection(source, connection);
          counts[outcome] = (counts[outcome] ?? 0) + 1;
          failed = outcome === 'unmappable' || outcome === 'reauth-required';
        }
      } catch (err) {
        counts.errors++;
        failed = true;
        if (err instanceof GoogleApiError && err.retryAt) {
          throw err;
        }
        console.warn(`${practitionerRef}: ${ref(candidate)}: ${normalizeErrorString(err)}`);
      }
      await session.checkpoint('discover', ref(candidate), failed);
      if (counts['reauth-required']) {
        break;
      }
    }
    if (!counts['reauth-required']) {
      await session.checkpoint('repair');
    }
  }
  if (counts['reauth-required']) {
    return counts;
  }
  const repairs = await session.reconcileExisting(connection);
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
