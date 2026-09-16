// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { HealthcareService, Slot } from '@medplum/fhirtypes';
import { resolveBookingGeometry } from '../bookingGeometry';
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
  readonly start: Date;
  readonly end: Date;
}

/**
 * Whether a Slot shares any time with the interval.
 * @param slot - The Slot to test.
 * @param startMs - When the interval opens.
 * @param endMs - When it closes.
 * @returns True when the two overlap.
 */
function overlaps(slot: Slot, startMs: number, endMs: number): boolean {
  const slotStart = slot.start ? Date.parse(slot.start) : NaN;
  const slotEnd = slot.end ? Date.parse(slot.end) : NaN;
  if (Number.isNaN(slotStart) || Number.isNaN(slotEnd)) {
    return false;
  }
  return slotStart < endMs && slotEnd > startMs;
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
  const { medplum, service, candidates, start, end } = options;
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const startMs = start.getTime();
  const endMs = end.getTime();

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

      const overlapping = slots.filter((slot) => overlaps(slot, startMs, endMs));
      const label = getCandidateDisplay(candidate);

      // Buffers and blocks are never overbookable, whatever the capacity: the server
      // holds them to one occupant.
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
