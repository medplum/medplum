// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { HealthcareService, Slot } from '@medplum/fhirtypes';
import { resolveBookingGeometry } from '../bookingGeometry';
import type { DateTimeRange } from '../types';
import type { ScheduleCandidate } from './AppointmentFinder.schedules';
import { getCandidateDisplay } from './AppointmentFinder.schedules';

// Past this many overlaps, naming one more clash tells nobody anything.
const CONFLICT_PAGE_SIZE = 200;

/** What a typed time runs into. */
export type ConflictKind = 'appointment' | 'blocked';

export interface BookingConflict {
  /** The schedule the conflict is on. */
  readonly schedule: string;
  /** Who or what holds that schedule, as the finder names them elsewhere. */
  readonly label: string;
  readonly kind: ConflictKind;
}

export interface FindBookingConflictsOptions {
  readonly medplum: MedplumClient;
  readonly service: WithId<HealthcareService>;
  readonly candidates: readonly ScheduleCandidate[];
  readonly range: DateTimeRange;
}

/**
 * Whether a Slot shares any time with the interval.
 * @param slot - The Slot to test.
 * @param range - The interval to test against.
 * @returns True when the two overlap.
 */
function overlaps(slot: Slot, range: DateTimeRange): boolean {
  const slotStart = Date.parse(slot.start);
  const slotEnd = Date.parse(slot.end);
  if (Number.isNaN(slotStart) || Number.isNaN(slotEnd)) {
    return false;
  }
  return slotStart < range.end.getTime() && slotEnd > range.start.getTime();
}

/**
 * Finds what a manually entered time clashes with, so the form can say so.
 *
 * Advisory only: it never decides whether a booking may go ahead, only what it would
 * sit on top of.
 *
 * Reports Slots, meaning booked visits, blocked time and buffers. It does **not**
 * report a time falling outside the schedule's configured hours, which would mean
 * resolving availability, recurrence and wall-clock times in the browser.
 *
 * @param options - The visit type, its schedules, and the interval being entered.
 * @returns One conflict per schedule that has one, in the order the schedules were given.
 */
export async function findBookingConflicts(options: FindBookingConflictsOptions): Promise<BookingConflict[]> {
  const { medplum, service, candidates, range } = options;
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();

  const found = await Promise.all(
    candidates.map(async (candidate): Promise<BookingConflict | undefined> => {
      const schedule = getReferenceString(candidate.schedule);

      const slots = await medplum.searchResources('Slot', [
        ['schedule', schedule],
        ['status', 'busy,busy-tentative,busy-unavailable'],
        ['start', `lt${endIso}`],
        ['end', `gt${startIso}`],
        ['_count', String(CONFLICT_PAGE_SIZE)],
      ]);

      const overlapping = slots.filter((slot) => overlaps(slot, range));
      const label = getCandidateDisplay(candidate);

      // Treat buffers and blocks as exclusive: the server never stamps a capacity on the
      // `busy-unavailable` Slots it writes, and over-warning is safe for advisory text.
      if (overlapping.some((slot) => slot.status === 'busy-unavailable')) {
        return { schedule, label, kind: 'blocked' };
      }

      const { slotCapacity } = resolveBookingGeometry(service, candidate.schedule);
      const booked = overlapping.filter((slot) => slot.status !== 'free').length;
      return booked >= slotCapacity ? { schedule, label, kind: 'appointment' } : undefined;
    })
  );

  return found.filter((conflict): conflict is BookingConflict => conflict !== undefined);
}

/**
 * Describes a conflict in one line, for warning text beside the time.
 * @param conflict - The conflict to describe.
 * @returns The sentence to show.
 */
export function describeConflict(conflict: BookingConflict): string {
  return conflict.kind === 'blocked'
    ? `Overlaps blocked time on ${conflict.label}'s schedule`
    : `Overlaps an existing appointment on ${conflict.label}'s schedule`;
}
