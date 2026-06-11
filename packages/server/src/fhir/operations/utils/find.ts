// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Temporal } from 'temporal-polyfill';
import type { Interval } from '../../../util/date';
import { addMinutes, clamp } from '../../../util/date';
import { eachDayOfInterval, normalizeIntervals, pairWithOverlaps } from './scheduling';

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

// JS `%` operator is "remainder", not "modulo", and can return negative numbers.
// Introducing our own mod function lets us guarantee that the result is in the
// range [0, d).
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

/**
 * Given an interval and slot duration and alignment information, return
 * intervals for each matching slot timing within that interval
 *
 * @param interval - The interval to find slots within
 * @param options - The alignment parameters
 * @param options.alignment - Minutes between slot starts; the grid is anchored to midnight (offset by offsetMinutes). Must be >= 1.
 * @param options.offsetMinutes - A number of minutes to offset the alignment by
 * @param options.durationMinutes - How long each slot should last
 * @param options.maxCount - Maximum number of intervals to find
 * @param options.timezone - IANA timezone name (e.g. "America/Los_Angeles"). When provided the
 *   alignment grid is anchored to local midnight in that timezone, keeping slot times stable
 *   across DST transitions. Defaults to UTC midnight.
 * @returns An array of aligned slot intervals
 */
export function findAlignedSlotTimes(
  interval: Interval,
  options: {
    alignment: number;
    offsetMinutes: number;
    durationMinutes: number;
    maxCount?: number;
    timezone?: string;
  }
): Interval[] {
  if (options.alignment < 1) {
    throw new Error(`Invalid alignment; must be positive, got ${options.alignment}`);
  }

  const results: Interval[] = [];

  for (const dayStart of eachDayOfInterval(interval, options.timezone ?? 'UTC')) {
    const nextDay = dayStart.add({ days: 1 });
    const dayInterval: Interval = {
      start: new Date(Math.max(interval.start.valueOf(), dayStart.epochMilliseconds)),
      end: new Date(Math.min(interval.end.valueOf(), nextDay.epochMilliseconds)),
    };

    const firstMinuteStart = advanceToMinuteMark(dayInterval.start);

    // Find how much to shift to the first aligned slot of this calendar day.
    const msm = minutesSinceMidnight(firstMinuteStart, options.timezone);
    const remainder = mod(msm - options.offsetMinutes, options.alignment);
    const toAlign = remainder === 0 ? 0 : options.alignment - remainder;

    let start = addMinutes(firstMinuteStart, toAlign);
    let end = addMinutes(start, options.durationMinutes);

    while (start < dayInterval.end && end <= interval.end) {
      results.push({ start, end });
      if (options.maxCount && results.length >= options.maxCount) {
        return results;
      }
      start = addMinutes(start, options.alignment);
      end = addMinutes(start, options.durationMinutes);
    }
  }

  return results;
}

/**
 * @param left - A normalized interval list
 * @param right - A normalized interval list
 * @returns A normalized interval list of intervals covered by both input lists
 */
export function overlappingIntervals(left: Interval[], right: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [interval, overlaps] of pairWithOverlaps(left, right)) {
    for (const overlap of overlaps) {
      result.push({
        start: clamp(interval.start, overlap),
        end: clamp(interval.end, overlap),
      });
    }
  }
  return normalizeIntervals(result);
}
