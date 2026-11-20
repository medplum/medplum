// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Temporal } from 'temporal-polyfill';
import type { Interval } from '../../../util/date';
import { addMinutes } from '../../../util/date';
import type { SchedulingParameters } from './scheduling-parameters';

export type AlignmentOptions = {
  interval: number;
  offset: number;
  timezone: string;
};

export function alignmentFromParameters(
  parameters: Pick<SchedulingParameters, 'alignmentInterval' | 'alignmentOffset' | 'alignmentTimezone'>
): AlignmentOptions {
  return {
    interval: parameters.alignmentInterval,
    offset: parameters.alignmentOffset,
    timezone: parameters.alignmentTimezone,
  };
}

// JS `%` operator is "remainder", not "modulo", and can return negative numbers.
// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder
function mod(n: number, d: number): number {
  return ((n % d) + d) % d;
}

// Returns the number of minutes since local (or UTC) midnight for a given date.
function minutesSinceMidnight(date: Date, timezone?: string): number {
  if (timezone && timezone !== 'UTC' && timezone !== 'Etc/UTC') {
    const zdt = Temporal.Instant.fromEpochMilliseconds(date.valueOf()).toZonedDateTimeISO(timezone);
    return zdt.hour * 60 + zdt.minute;
  }
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function assertValidAlignment(alignment: AlignmentOptions): void {
  if (alignment.interval < 1) {
    throw new Error(`Invalid alignment interval; must be positive, got ${alignment.interval}`);
  }
}

// Returns the number of minutes from the previous grid line to the given date's minute.
// Zero means that minute is on the grid.
function minutesPastGridLine(date: Date, alignment: AlignmentOptions): number {
  return mod(minutesSinceMidnight(date, alignment.timezone) - alignment.offset, alignment.interval);
}

/**
 * Returns true when `date` falls exactly on the alignment grid.
 * The grid for a given day is anchored to local midnight in `timezone`:
 * offset, offset+interval, offset+2*interval, ...
 *
 * @param date - a Date to test the alignment of
 * @param alignment - parameters defining the alignment grid
 * @param alignment.interval - minutes between grid entries
 * @param alignment.offset - shift the grid by this amount
 * @param alignment.timezone - anchors the grid to midnight in this timezone
 * @returns boolean
 */
export function isAlignedToGrid(date: Date, alignment: AlignmentOptions): boolean {
  assertValidAlignment(alignment);
  if (date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) {
    return false;
  }
  return minutesPastGridLine(date, alignment) === 0;
}

// The first instant of each local day the interval touches. That's usually midnight, but not on a
// day whose midnight a DST transition skips, and the next day starts at its own midnight again.
export function eachDayOfInterval(interval: Interval, timeZone: string): Temporal.ZonedDateTime[] {
  let t = Temporal.Instant.fromEpochMilliseconds(interval.start.valueOf()).toZonedDateTimeISO(timeZone).startOfDay();

  const results: Temporal.ZonedDateTime[] = [];
  while (t.epochMilliseconds < interval.end.valueOf()) {
    results.push(t);
    t = t.add({ days: 1 }).startOfDay();
  }
  return results;
}

// Given a date that could have a seconds / milliseconds component, return
// the input date if it does not have any, and the start of the next minute
// if it does.
function advanceToMinuteMark(date: Date): Date {
  const start = new Date(date);
  start.setSeconds(0, 0);
  if (start.valueOf() !== date.valueOf()) {
    return addMinutes(start, 1);
  }
  return start;
}

/**
 * Given an interval and slot duration and alignment information, return
 * intervals for each matching slot timing within that interval
 *
 * @param interval - The interval to find slots within
 * @param options - The alignment and slot parameters
 * @param options.alignment - Parameters defining the alignment grid
 * @param options.durationMinutes - How long each slot should last
 * @param options.maxCount - Maximum number of intervals to find
 * @param options.filter - Only return slots this accepts. Rejected slots do not count
 *   towards `maxCount`.
 * @returns An array of aligned slot intervals
 */
export function findAlignedSlotTimes(
  interval: Interval,
  options: {
    alignment: AlignmentOptions;
    durationMinutes: number;
    maxCount?: number;
    filter?: (interval: Interval) => boolean;
  }
): Interval[] {
  assertValidAlignment(options.alignment);

  const results: Interval[] = [];

  for (const dayStart of eachDayOfInterval(interval, options.alignment.timezone)) {
    const nextDay = dayStart.add({ days: 1 }).startOfDay();
    const dayInterval: Interval = {
      start: new Date(Math.max(interval.start.valueOf(), dayStart.epochMilliseconds)),
      end: new Date(Math.min(interval.end.valueOf(), nextDay.epochMilliseconds)),
    };

    const firstMinuteStart = advanceToMinuteMark(dayInterval.start);

    // Find how much to shift to the first aligned slot of this calendar day.
    const remainder = minutesPastGridLine(firstMinuteStart, options.alignment);
    const toAlign = remainder === 0 ? 0 : options.alignment.interval - remainder;

    let start = addMinutes(firstMinuteStart, toAlign);
    let end = addMinutes(start, options.durationMinutes);

    // `start` values after the end of the current day will be processed in
    // the next day's interval and aligned to that day's grid.
    //
    // `end` values are allowed to match up to (and including) the end of the
    // search interval, but may not go beyond.
    while (start < dayInterval.end && end <= interval.end) {
      if (!options.filter || options.filter({ start, end })) {
        results.push({ start, end });
        if (options.maxCount && results.length >= options.maxCount) {
          return results;
        }
      }
      start = addMinutes(start, options.alignment.interval);
      end = addMinutes(start, options.durationMinutes);
    }
  }

  return results;
}
