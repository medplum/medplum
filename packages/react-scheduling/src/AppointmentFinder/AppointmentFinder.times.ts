// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, isDefined } from '@medplum/core';
import type { Appointment, Reference } from '@medplum/fhirtypes';
import { isSameDay } from '@medplum/react';
import type { SchedulingActor } from './AppointmentFinder.roles';

/**
 * The longest window `Appointment/$find` accepts. Requests wider than this are
 * rejected outright, so callers have to keep their own date range inside it.
 */
export const MAX_FIND_WINDOW_DAYS = 31;

export type TimeOfDay = 'any' | 'morning' | 'afternoon';

/** A calendar day's worth of available times, split by the actors offering them. */
export interface AppointmentSlotGroup {
  /** Stable key derived from the actors, so React keys survive a refetch. */
  readonly key: string;
  readonly actors: readonly SchedulingActor[];
  readonly durationMinutes: number;
  /** Sorted by start time. */
  readonly appointments: readonly Appointment[];
}

export interface AppointmentDay {
  /** `YYYY-MM-DD` in the scheduling timezone. */
  readonly key: string;
  /** Local midnight of the same calendar day, for the calendar and its heading. */
  readonly date: Date;
  readonly groups: readonly AppointmentSlotGroup[];
}

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/**
 * Breaks an instant into calendar parts in a given timezone.
 *
 * Days and times are always read in the schedule's timezone rather than the
 * browser's, so a clinic three timezones away still shows its own hours.
 *
 * @param date - The instant to read.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The year, month, day, and hour in that timezone.
 */
function getZonedParts(date: Date, timezone: string | undefined): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value);

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/**
 * Formats an instant's time of day in a given timezone (e.g. "12:30 PM").
 * @param date - The instant to format.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The formatted time.
 */
export function formatZonedTime(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Formats a calendar day as a heading (e.g. "Monday, July 27").
 * @param date - Local midnight of the day.
 * @returns The formatted day.
 */
export function formatDayHeading(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

/**
 * Returns how far a timezone is from UTC at a given instant.
 * @param instant - The instant to read the offset at.
 * @param timezone - IANA timezone identifier.
 * @returns The offset in milliseconds, positive east of UTC.
 */
function getTimezoneOffsetMs(instant: Date, timezone: string): number {
  const { year, month, day, hour, minute } = getZonedParts(instant, timezone);
  // No zone is offset by part of a minute, so comparing whole minutes is enough
  // and avoids having to format seconds.
  return Date.UTC(year, month - 1, day, hour, minute) - Math.floor(instant.getTime() / 60000) * 60000;
}

/**
 * Reads a wall-clock time on a given day as an instant in a timezone.
 *
 * A time typed into the form means the time on the clinic's clock, so it has to
 * be resolved through the scheduling timezone rather than the browser's.
 *
 * @param day - Local midnight of the day the time falls on.
 * @param time - A 24-hour `HH:MM` time.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The instant, or undefined when the time is not a valid `HH:MM`.
 */
export function parseZonedTime(day: Date, time: string, timezone?: string): Date | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return undefined;
  }
  if (!timezone) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  }

  const wallClock = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  // Read the offset near the answer, then re-read it at the answer in case the
  // first guess landed on the far side of a daylight saving change.
  const guess = getTimezoneOffsetMs(new Date(wallClock), timezone);
  const offset = getTimezoneOffsetMs(new Date(wallClock - guess), timezone);
  return new Date(wallClock - offset);
}

/**
 * Restricts appointments to a half of the day, read in the scheduling timezone.
 * @param appointments - Appointments to filter.
 * @param timeOfDay - The half of the day to keep, or `any` to keep all.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The matching appointments.
 */
export function filterByTimeOfDay(
  appointments: readonly Appointment[],
  timeOfDay: TimeOfDay,
  timezone?: string
): Appointment[] {
  if (timeOfDay === 'any') {
    return [...appointments];
  }
  return appointments.filter((appointment) => {
    if (!appointment.start) {
      return false;
    }
    const { hour } = getZonedParts(new Date(appointment.start), timezone);
    return timeOfDay === 'morning' ? hour < 12 : hour >= 12;
  });
}

/**
 * Groups proposed appointments into days, and each day into the sets of actors
 * offering those times.
 *
 * A search holds one set of actors, so a day usually has a single group. The
 * grouping is what names who the times are with, and it keeps the times from an
 * earlier search from being read as this one's when the selection changes.
 *
 * @param appointments - Proposed appointments from `$find`.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns Days in ascending order, each holding its groups.
 */
export function groupAppointmentsByDay(appointments: readonly Appointment[], timezone?: string): AppointmentDay[] {
  const days = new Map<string, Map<string, Appointment[]>>();

  for (const appointment of appointments) {
    if (!appointment.start) {
      continue;
    }
    const { year, month, day } = getZonedParts(new Date(appointment.start), timezone);
    const dayKey = `${year}-${pad(month)}-${pad(day)}`;

    let groups = days.get(dayKey);
    if (!groups) {
      groups = new Map();
      days.set(dayKey, groups);
    }

    const groupKey = getActorGroupKey(appointment);
    const group = groups.get(groupKey);
    if (group) {
      group.push(appointment);
    } else {
      groups.set(groupKey, [appointment]);
    }
  }

  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, groups]) => ({
      key: dayKey,
      date: parseDayKey(dayKey),
      groups: [...groups.entries()]
        .map(([groupKey, groupAppointments]) => toSlotGroup(groupKey, groupAppointments))
        .sort((left, right) => left.key.localeCompare(right.key)),
    }));
}

function toSlotGroup(key: string, appointments: Appointment[]): AppointmentSlotGroup {
  const sorted = [...appointments].sort((left, right) => (left.start ?? '').localeCompare(right.start ?? ''));
  return {
    key,
    actors: sorted[0]?.participant?.map((participant) => participant.actor).filter(isDefined) ?? [],
    durationMinutes: getDurationMinutes(sorted[0]),
    appointments: sorted,
  };
}

/**
 * Builds a key identifying the set of actors an appointment is offered by.
 * @param appointment - The proposed appointment.
 * @returns A key that is stable across refetches.
 */
export function getActorGroupKey(appointment: Appointment): string {
  return getActorsKey((appointment.participant ?? []).map((participant) => participant.actor).filter(isDefined));
}

/**
 * Builds a key identifying a set of actors, independent of their order.
 * @param actors - The actors to key.
 * @returns The key.
 */
export function getActorsKey(actors: readonly Reference[]): string {
  return actors
    .map((actor) => getReferenceString(actor))
    .filter(isDefined)
    .sort((left, right) => left.localeCompare(right))
    .join('+');
}

/**
 * Returns an appointment's length in whole minutes.
 *
 * Taken from the proposed appointment itself rather than re-resolving
 * `SchedulingParameters`, which is what the server already did to produce it.
 *
 * @param appointment - The proposed appointment.
 * @returns The length in minutes, or 0 when either end is missing.
 */
export function getDurationMinutes(appointment: Appointment | undefined): number {
  if (!appointment?.start || !appointment.end) {
    return 0;
  }
  const start = new Date(appointment.start).getTime();
  const end = new Date(appointment.end).getTime();
  return Math.round((end - start) / 60000);
}

/**
 * Returns a key uniquely identifying a proposed appointment.
 *
 * Proposed appointments have no id, and consecutive pages meet at the boundary
 * of a day, so identity is the times plus the actors.
 *
 * @param appointment - The proposed appointment.
 * @returns The de-duplication key.
 */
export function getAppointmentKey(appointment: Appointment): string {
  return `${appointment.start}/${appointment.end}/${getActorGroupKey(appointment)}`;
}

/**
 * Converts a `YYYY-MM-DD` key into local midnight of that calendar day.
 *
 * The calendar reads dates with `getDate()` and friends, so a day identified in
 * the schedule's timezone has to be re-expressed locally to land on the right
 * cell.
 *
 * @param key - A `YYYY-MM-DD` day key.
 * @returns Local midnight of that day.
 */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Returns the input type to use for a date or time field.
 *
 * JSDOM does not fire change events for `<input type="date">` or
 * `<input type="time">`, so tests get a plain text field, matching what
 * `DateTimeInput` does.
 *
 * @param type - The native input type to use outside of tests.
 * @returns The input type for the current environment.
 */
export function getNativeInputType(type: 'date' | 'time'): string {
  return import.meta.env.NODE_ENV === 'test' ? 'text' : type;
}

/**
 * Returns the last instant of a day, so that a range covers the whole of it.
 * @param date - Any instant during the day.
 * @returns Local midnight less a millisecond, at the end of that day.
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** The days a search covers. Either end may be open. */
export interface DateRange {
  readonly start?: Date;
  readonly end?: Date;
}

/**
 * Returns the last instant of a date's month.
 * @param date - Any instant during the month.
 * @returns The close of that month's last day.
 */
export function endOfMonth(date: Date): Date {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/**
 * Lists the days a range covers, for marking them on the calendar.
 *
 * @param range - The days asked for.
 * @param limit - The most days to return, so an open-ended range stays bounded.
 * @returns Local midnight of each day, or an empty array for an open range.
 */
export function enumerateDateRange(range: DateRange, limit = MAX_FIND_WINDOW_DAYS): Date[] {
  if (!range.start || !range.end) {
    return range.start ? [range.start] : [];
  }
  const days: Date[] = [];
  for (let day = range.start; day <= range.end && days.length < limit; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/**
 * Says in words which days a search covers.
 * @param range - The days asked for.
 * @returns The range as a phrase, or undefined when both ends are open.
 */
export function formatDateRange(range: DateRange): string | undefined {
  const { start, end } = range;
  if (start && end) {
    return isSameDay(start, end) ? formatDayHeading(start) : `${formatDayHeading(start)} – ${formatDayHeading(end)}`;
  }
  if (start) {
    return `From ${formatDayHeading(start)}`;
  }
  if (end) {
    return `Through ${formatDayHeading(end)}`;
  }
  return undefined;
}
