// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { extractServiceTypeReferences, getExtensionValue, TimezoneExtensionURI } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import type { ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';
import { formatDayHeading, formatZonedTime } from '../AppointmentFinder/AppointmentFinder.times';

/** The zones the calendars on show are kept in, and whether any of them is unknown. */
export interface CalendarTimezones {
  /** One entry per calendar whose zone could be read. */
  readonly timezones: string[];
  /** Whether any calendar's actor could not be read, leaving its zone untold. */
  readonly anyUnknown: boolean;
}

/**
 * Reads the zones the calendars on show are drawn for.
 *
 * A calendar's zone is read off its actor alone. A Schedule can also carry a zone per
 * service in its scheduling parameters, but nothing here names a service to pick between
 * them, and while a Schedule holds a single actor the actor's own zone is the one those
 * parameters are likely to agree with anyway.
 *
 * An actor that could not be read is reported as unknown rather than passed over. A
 * caller may be entitled to read a Schedule without being entitled to read its actor,
 * and the grid is drawn either way, so saying nothing would let times kept elsewhere be
 * read as the viewer's own. An actor that was read and simply names no zone is not that
 * case, and is passed over as before.
 *
 * @param candidates - The calendars on show.
 * @returns The zones that could be read, and whether any could not.
 */
export function getCalendarTimezones(candidates: readonly ScheduleCandidate[]): CalendarTimezones {
  const timezones: string[] = [];
  let anyUnknown = false;

  for (const candidate of candidates) {
    if (!candidate.actorResource) {
      anyUnknown = true;
      continue;
    }
    const timezone = getExtensionValue(candidate.actorResource, TimezoneExtensionURI);
    if (typeof timezone === 'string') {
      timezones.push(timezone);
    }
  }

  return { timezones, anyUnknown };
}

/**
 * Sorts appointments by the service type they are for, which is what they are colored by.
 *
 * An appointment naming several services is sorted under the first.
 *
 * @param appointments - The appointments to sort.
 * @returns The appointments, by HealthcareService reference; those naming none are under
 * `undefined`.
 */
export function groupAppointmentsByService(
  appointments: readonly WithId<Appointment>[]
): Map<string | undefined, WithId<Appointment>[]> {
  const groups = new Map<string | undefined, WithId<Appointment>[]>();
  for (const appointment of appointments) {
    const reference = extractServiceTypeReferences(appointment.serviceType)[0]?.reference;
    const group = groups.get(reference) ?? [];
    group.push(appointment);
    groups.set(reference, group);
  }
  return groups;
}

/**
 * Says when a visit or a block of time is, as far as it is known.
 * @param period - The appointment or slot being described.
 * @param period.start - When it starts.
 * @param period.end - When it ends.
 * @returns The day and the times, naming the end's day too when it is another, or undefined
 * for one holding no time.
 */
export function formatWhen(period: { readonly start?: string; readonly end?: string }): string | undefined {
  if (!period.start) {
    return undefined;
  }
  const start = new Date(period.start);
  const end = period.end ? new Date(period.end) : undefined;
  if (end && end.toDateString() !== start.toDateString()) {
    return `${formatDayHeading(start)} · ${formatZonedTime(start)} – ${formatDayHeading(end)} · ${formatZonedTime(end)}`;
  }
  const times = [formatZonedTime(start), end && formatZonedTime(end)].filter(Boolean).join(' – ');
  return `${formatDayHeading(start)} · ${times}`;
}

/** The statuses `Appointment/:id/$cancel` accepts. It refuses any other with a 400. */
const CANCELABLE_STATUSES: ReadonlySet<Appointment['status']> = new Set(['pending', 'booked']);

/**
 * Whether the server would accept cancelling the appointment.
 * @param appointment - The appointment to cancel.
 * @returns True when its status is one `Appointment/:id/$cancel` accepts.
 */
export function isCancelable(appointment: Appointment): boolean {
  return CANCELABLE_STATUSES.has(appointment.status);
}

/**
 * The statuses `Appointment/:id/$reschedule` accepts. It refuses any other with a 400.
 *
 * The same statuses a cancellation accepts today, but a guard of its own: what can be
 * called off and what can be moved are separate questions to the server.
 */
const RESCHEDULABLE_STATUSES: ReadonlySet<Appointment['status']> = new Set(['pending', 'booked']);

/**
 * Whether the server would accept rescheduling the appointment.
 * @param appointment - The appointment to reschedule.
 * @returns True when its status is one `Appointment/:id/$reschedule` accepts.
 */
export function isReschedulable(appointment: Appointment): boolean {
  return RESCHEDULABLE_STATUSES.has(appointment.status);
}
