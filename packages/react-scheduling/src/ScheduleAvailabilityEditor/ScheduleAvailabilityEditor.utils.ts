// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DayOfWeek } from '@medplum/core';
import { DAYS_OF_WEEK, isDayOfWeek } from '@medplum/core';
import type { HealthcareServiceAvailableTime } from '@medplum/fhirtypes';

/** Minutes in a day. Also the exclusive end of the day, displayed as 12:00 AM. */
export const MINUTES_PER_DAY = 1440;

/**
 * Granularity of the times the pickers list. Typing reaches a time between two
 * of them, so this sets what is convenient rather than what is possible.
 */
export const TIME_STEP_MINUTES = 15;

/** Hours a day gets when it is first marked available: 9:00 AM to 5:00 PM. */
export const DEFAULT_RANGE: MinuteRange = { start: 9 * 60, end: 17 * 60 };

export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/**
 * The order days are listed in the editor. `DAYS_OF_WEEK` is the FHIR order,
 * which starts on Monday, but the editor reads as a calendar and so starts on
 * Sunday.
 */
export const DAY_DISPLAY_ORDER: readonly DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * A block of hours, as minutes from midnight. `end` is exclusive and may be
 * `MINUTES_PER_DAY`, meaning the block runs to the end of the day.
 */
export interface MinuteRange {
  readonly start: number;
  readonly end: number;
}

/**
 * One day's hours. `ranges` is kept while a day is unavailable, so marking it
 * available again restores the hours that were there rather than a blank row.
 */
export interface DayAvailability {
  available: boolean;
  ranges: MinuteRange[];
}

/**
 * A day-keyed view of availability. `HealthcareServiceAvailableTime` groups days
 * together under a shared time range, which is compact for storage but awkward
 * to edit one day at a time, so the editor pivots it into this shape.
 */
export type WeeklyAvailability = Record<DayOfWeek, DayAvailability>;

export function blankWeeklyAvailability(): WeeklyAvailability {
  const weekly = {} as WeeklyAvailability;
  for (const day of DAYS_OF_WEEK) {
    weekly[day] = { available: false, ranges: [{ ...DEFAULT_RANGE }] };
  }
  return weekly;
}

/**
 * Returns the day following the given one, wrapping from Sunday to Monday.
 * @param day - The day to advance from
 * @returns The next day of the week
 */
export function nextDayOfWeek(day: DayOfWeek): DayOfWeek {
  return DAYS_OF_WEEK[(DAYS_OF_WEEK.indexOf(day) + 1) % DAYS_OF_WEEK.length];
}

// Minutes from midnight, or undefined when the time is missing or malformed.
// FHIR `time` has no timezone, so this is a plain offset into the day. Seconds
// are optional because older values may omit them, and fractional seconds are
// accepted because FHIR `time` permits them. The editor is minute-granular, so
// anything finer rounds to the nearest minute.
function parseTimeOfDay(time: string | undefined): number | undefined {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(time ?? '');
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return undefined;
  }
  return hours * 60 + minutes + Math.round(Number(match[3] ?? 0) / 60);
}

// FHIR `time` cannot express 24:00, so the end of the day is written as
// midnight. Scheduling reads an end at or before the start as running to the end
// of the day, which is how a block ending at `MINUTES_PER_DAY` round-trips.
function formatTimeOfDay(minutes: number): string {
  const total = minutes % MINUTES_PER_DAY;
  const hh = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}:00`;
}

// Sorts a day's blocks and folds together any that overlap or touch. Stored
// availability has no such guarantee (the server merges overlaps when it reads
// them), but the editor's pickers derive their bounds from the neighbouring
// rows, so the rows have to be ordered and disjoint to make sense.
function normalizeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges].filter((range) => range.end > range.start).sort((a, b) => a.start - b.start);
  const merged: MinuteRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      merged[merged.length - 1] = { start: previous.start, end: Math.max(previous.end, range.end) };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/**
 * Pivots availability entries into the day-keyed view the editor edits.
 *
 * The editor cannot author a window that runs past midnight, but stored
 * availability can contain one, whether written by an earlier version of this
 * editor or by the API. Rather than lock those schedules out, a window like
 * Friday 10:00 PM to 6:00 AM is split at midnight into Friday 10:00 PM to
 * 12:00 AM plus Saturday 12:00 AM to 6:00 AM, which the scheduling operations
 * read identically.
 * @param availableTime - Availability entries to pivot
 * @returns The equivalent day-keyed availability
 */
export function toWeeklyAvailability(availableTime: HealthcareServiceAvailableTime[] | undefined): WeeklyAvailability {
  const weekly = blankWeeklyAvailability();
  const collected = {} as Record<DayOfWeek, MinuteRange[]>;
  for (const day of DAYS_OF_WEEK) {
    collected[day] = [];
  }

  for (const entry of availableTime ?? []) {
    const days = (entry.daysOfWeek ?? []).filter(isDayOfWeek);
    if (entry.allDay === true) {
      for (const day of days) {
        collected[day].push({ start: 0, end: MINUTES_PER_DAY });
      }
      continue;
    }

    const start = parseTimeOfDay(entry.availableStartTime);
    const end = parseTimeOfDay(entry.availableEndTime);
    if (start === undefined || end === undefined) {
      continue;
    }

    for (const day of days) {
      if (end > start) {
        collected[day].push({ start, end });
      } else {
        // Scheduling reads an end at or before the start as running into the
        // following day, so an end equal to the start is a full 24 hours from
        // the start rather than a day that begins at midnight. Only 00:00 to
        // 00:00 falls entirely within the one day.
        const wrapEnd = end === start ? start : end;
        collected[day].push({ start, end: MINUTES_PER_DAY });
        if (wrapEnd > 0) {
          collected[nextDayOfWeek(day)].push({ start: 0, end: wrapEnd });
        }
      }
    }
  }

  for (const day of DAYS_OF_WEEK) {
    const ranges = normalizeRanges(collected[day]);
    if (ranges.length > 0) {
      weekly[day] = { available: true, ranges };
    }
  }

  return weekly;
}

/**
 * Flattens the day-keyed editor view back into availability entries.
 *
 * A block covering the whole day is written with the `allDay` flag rather than
 * as a pair of midnight times, since that is the clearer of the two encodings
 * and is what the editor reads back.
 * @param weekly - Day-keyed availability to flatten
 * @returns One availability entry per block of hours
 */
export function fromWeeklyAvailability(weekly: WeeklyAvailability): HealthcareServiceAvailableTime[] {
  const availableTime: HealthcareServiceAvailableTime[] = [];
  for (const day of DAYS_OF_WEEK) {
    if (!weekly[day].available) {
      continue;
    }
    for (const range of weekly[day].ranges) {
      if (range.start === 0 && range.end === MINUTES_PER_DAY) {
        availableTime.push({ daysOfWeek: [day], allDay: true });
      } else {
        availableTime.push({
          daysOfWeek: [day],
          availableStartTime: formatTimeOfDay(range.start),
          availableEndTime: formatTimeOfDay(range.end),
        });
      }
    }
  }
  return availableTime;
}

/**
 * Returns whether at least one day has hours.
 * @param weekly - Day-keyed availability to inspect
 * @returns True when any day is available with at least one block
 */
export function hasAnyAvailableDay(weekly: WeeklyAvailability): boolean {
  return DAYS_OF_WEEK.some((day) => weekly[day].available && weekly[day].ranges.length > 0);
}

/**
 * Formats minutes from midnight for display, as in `9:05 AM`.
 *
 * `MINUTES_PER_DAY` is the end of the day rather than the start of the next one,
 * but both read as 12:00 AM.
 * @param minutes - Minutes from midnight
 * @returns The time in 12 hour form
 */
export function formatMinutesOfDay(minutes: number): string {
  if (minutes === MINUTES_PER_DAY) {
    return '12:00 AM';
  }
  const hours = Math.floor(minutes / 60);
  const meridiem = hours < 12 ? 'AM' : 'PM';
  return `${hours % 12 === 0 ? 12 : hours % 12}:${(minutes % 60).toString().padStart(2, '0')} ${meridiem}`;
}

// The first time on the picker's interval at or after the given one.
function ceilToTimeStep(minutes: number): number {
  return Math.ceil(minutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
}

/**
 * Lists the selectable times between two bounds, inclusive.
 *
 * Callers derive the bounds from the neighbouring rows, so the options offered
 * are only ever the times still free on that day. The interval is measured from
 * midnight rather than from `min`, so a bound that sits off the interval (a
 * neighbouring block stored as 9:07, say) narrows the list without shifting the
 * times in it.
 * @param min - Earliest selectable time, in minutes from midnight
 * @param max - Latest selectable time, in minutes from midnight
 * @param include - Times to offer alongside the interval, such as the current value or one that has been typed.
 * Any that fall outside the bounds are left out, so this cannot widen what a row may be set to.
 * @returns Times at `TIME_STEP_MINUTES` intervals from midnight, plus the included ones, in order
 */
export function timeOptions(min: number, max: number, include: readonly number[] = []): number[] {
  const options = new Set<number>();
  for (let minutes = ceilToTimeStep(min); minutes <= max; minutes += TIME_STEP_MINUTES) {
    options.add(minutes);
  }
  for (const time of include) {
    if (time >= min && time <= max) {
      options.add(time);
    }
  }
  return [...options].sort((a, b) => a - b);
}

/**
 * Returns the option closest to a time, for scrolling a list to roughly where
 * the current value sits when the value itself is not on the list.
 * @param options - The selectable times, from `timeOptions`
 * @param value - The current time, in minutes from midnight
 * @returns The nearest option, or undefined when there are none
 */
export function nearestOption(options: number[], value: number): number | undefined {
  let nearest: number | undefined;
  for (const option of options) {
    if (nearest === undefined || Math.abs(option - value) < Math.abs(nearest - value)) {
      nearest = option;
    }
  }
  return nearest;
}

interface TimeQuery {
  readonly hour: number;
  readonly minutes: string;
  readonly meridiem: 'am' | 'pm' | undefined;
  readonly rank: number;
}

// A typed "a" or "p" anywhere narrows to morning or afternoon. Anything else,
// including nothing at all, leaves both open.
function readMeridiem(query: string): TimeQuery['meridiem'] {
  const lower = query.toLowerCase();
  if (lower.includes('a')) {
    return 'am';
  }
  if (lower.includes('p')) {
    return 'pm';
  }
  return undefined;
}

// Two typed minute digits pin a time down; none leaves a whole hour open; one
// sits in between. Lower ranks are offered first.
function rankMinutes(minutes: string): number {
  if (minutes.length === 2) {
    return 0;
  }
  return minutes.length === 0 ? 1 : 2;
}

// Reads what someone has typed so far as one or more times they might mean.
// "12" is both 12 o'clock and 1:2x, so both are returned, ranked so the more
// complete reading comes first.
function parseTimeQuery(query: string): TimeQuery[] {
  const digits = query.replace(/[^0-9]/g, '');
  if (!digits) {
    return [];
  }
  const meridiem = readMeridiem(query);

  return [1, 2]
    .filter((hourDigits) => {
      const hour = Number(digits.slice(0, hourDigits));
      const minutes = digits.slice(hourDigits);
      return (
        hourDigits <= digits.length &&
        hour >= 1 &&
        hour <= 12 &&
        minutes.length <= 2 &&
        // A leading "1" is the start of a one digit hour as readily as a two
        // digit one, so "12" is both. A leading "0" can only be padding, since
        // there is no hour 0 on a 12 hour clock, so "0930" is 9:30.
        (hourDigits === 1 || hour >= 10 || digits.startsWith('0'))
      );
    })
    .map((hourDigits) => {
      const minutes = digits.slice(hourDigits);
      return { hour: Number(digits.slice(0, hourDigits)), minutes, meridiem, rank: rankMinutes(minutes) };
    })
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Returns whether what has been typed names a time at all.
 *
 * Text that names none, such as `noon` or a bare `0`, leaves the list unnarrowed, which is not the same as the
 * list having nothing to offer. Callers that act on a query when the field is left need to tell the two apart,
 * or they would take the first time on an unnarrowed list as though it had been asked for.
 * @param query - What has been typed, e.g. `930p`
 * @returns True when the query narrows the times on offer
 */
export function isTimeQuery(query: string): boolean {
  return parseTimeQuery(query).length > 0;
}

function matchesTimeQuery(minutes: number, query: TimeQuery): boolean {
  const total = minutes === MINUTES_PER_DAY ? 0 : minutes;
  const hours = Math.floor(total / 60);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  if (hour12 !== query.hour || (query.meridiem && query.meridiem !== (hours < 12 ? 'am' : 'pm'))) {
    return false;
  }
  return (total % 60).toString().padStart(2, '0').startsWith(query.minutes);
}

// Typing "9" matches both 9 AM and 9 PM. Leading with whichever hour sits closer
// to the current value puts the likely choice at the top of the list without
// hiding the other one.
function leadWithNearestHour(options: number[], current: number): number[] {
  const byHour = new Map<number, { index: number; distance: number }>();
  options.forEach((option, index) => {
    const hour = Math.floor(option / 60);
    const distance = Math.abs(option - current);
    const seen = byHour.get(hour);
    byHour.set(hour, seen ? { index: seen.index, distance: Math.min(seen.distance, distance) } : { index, distance });
  });

  let rotateAt = 0;
  let nearest = Infinity;
  byHour.forEach((entry) => {
    if (entry.distance < nearest) {
      nearest = entry.distance;
      rotateAt = entry.index;
    }
  });

  return rotateAt === 0 ? options : [...options.slice(rotateAt), ...options.slice(0, rotateAt)];
}

/**
 * Reads the exact times a finished query names, for offering alongside the interval.
 *
 * The list is there to make the common times quick to reach, not to rule the
 * others out, so typing a time in full offers that time even when it falls
 * between two on the list. Only a complete query counts: an hour with both
 * minute digits. Anything shorter still names a range of times, which the list
 * already narrows to. Without AM or PM the hour is ambiguous, so both readings
 * are offered, the same way a bare hour matches two entries on the list.
 * @param query - What has been typed, e.g. `303p`
 * @returns The times the query names exactly, in minutes from midnight
 */
export function typedTimes(query: string): number[] {
  return parseTimeQuery(query)
    .filter((parsed) => parsed.minutes.length === 2 && Number(parsed.minutes) < 60)
    .flatMap((parsed) => {
      const hour = parsed.hour % 12;
      const minutes = Number(parsed.minutes);
      const meridiems = parsed.meridiem ? [parsed.meridiem] : (['am', 'pm'] as const);
      return meridiems.map((meridiem) => (meridiem === 'am' ? hour : hour + 12) * 60 + minutes);
    });
}

/**
 * Narrows the selectable times to those matching what has been typed.
 *
 * Typing is a way to reach a time quickly rather than a separate way to enter
 * one, so the result is always a subset of `options` and the picker stays
 * limited to the times still free on that day. A time typed in full reaches the
 * list through `typedTimes` rather than around it, so the bounds still hold.
 * @param options - The selectable times, from `timeOptions`
 * @param query - What has been typed, e.g. `930p`
 * @param current - The currently selected time, used to order equally good matches
 * @returns The matching times, most likely first, or all options when nothing is typed
 */
export function filterTimeOptions(options: number[], query: string, current: number): number[] {
  const queries = parseTimeQuery(query);
  if (queries.length === 0) {
    return options;
  }

  const seen = new Set<number>();
  const matches: number[] = [];
  for (const parsed of queries) {
    const matched = options.filter((option) => !seen.has(option) && matchesTimeQuery(option, parsed));
    matched.forEach((option) => seen.add(option));
    matches.push(...leadWithNearestHour(matched, current));
  }
  return matches;
}

/**
 * Returns whether another block of hours fits after the last one.
 * @param ranges - The day's blocks, in order
 * @returns True when the day does not already run to midnight
 */
export function canAddRange(ranges: MinuteRange[]): boolean {
  return ranges.length > 0 && ranges[ranges.length - 1].end <= MINUTES_PER_DAY - TIME_STEP_MINUTES;
}

/**
 * Builds the block to append after the ones already on a day.
 *
 * It opens an hour after the previous block ends and runs for an hour, which is
 * the usual shape of a break in the middle of a day, then clamps to midnight.
 * A block the editor adds is always on the picker's interval, even when the one
 * before it came from elsewhere and is not.
 * @param ranges - The day's blocks, in order
 * @returns The block to append
 */
export function nextRange(ranges: MinuteRange[]): MinuteRange {
  const lastEnd = ranges[ranges.length - 1].end;
  const start = Math.max(
    ceilToTimeStep(lastEnd),
    Math.min(ceilToTimeStep(lastEnd + 60), MINUTES_PER_DAY - TIME_STEP_MINUTES)
  );
  return { start, end: Math.min(start + 60, MINUTES_PER_DAY) };
}
