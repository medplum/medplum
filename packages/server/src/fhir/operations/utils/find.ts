// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Interval } from '../../../util/date';
import { addMinutes, clamp } from '../../../util/date';
import type { AlignmentOptions } from './scheduling';
import { eachDayOfInterval, minutesSinceMidnight, mod, normalizeIntervals, pairWithOverlaps } from './scheduling';

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
 * @returns An array of aligned slot intervals
 */
export function findAlignedSlotTimes(
  interval: Interval,
  options: {
    alignment: AlignmentOptions;
    durationMinutes: number;
    maxCount?: number;
  }
): Interval[] {
  if (options.alignment.interval < 1) {
    throw new Error(`Invalid alignment interval; must be positive, got ${options.alignment.interval}`);
  }

  const results: Interval[] = [];

  for (const dayStart of eachDayOfInterval(interval, options.alignment.timezone)) {
    const nextDay = dayStart.add({ days: 1 });
    const dayInterval: Interval = {
      start: new Date(Math.max(interval.start.valueOf(), dayStart.epochMilliseconds)),
      end: new Date(Math.min(interval.end.valueOf(), nextDay.epochMilliseconds)),
    };

    const firstMinuteStart = advanceToMinuteMark(dayInterval.start);

    // Find how much to shift to the first aligned slot of this calendar day.
    const msm = minutesSinceMidnight(firstMinuteStart, options.alignment.timezone);
    const remainder = mod(msm - options.alignment.offset, options.alignment.interval);
    const toAlign = remainder === 0 ? 0 : options.alignment.interval - remainder;

    let start = addMinutes(firstMinuteStart, toAlign);
    let end = addMinutes(start, options.durationMinutes);

    // `start` values after the end of the current day will be processed in
    // the next day's interval and aligned to that day's grid.
    //
    // `end` values are allowed to match up to (and including) the end of the
    // search interval, but may not go beyond.
    while (start < dayInterval.end && end <= interval.end) {
      results.push({ start, end });
      if (options.maxCount && results.length >= options.maxCount) {
        return results;
      }
      start = addMinutes(start, options.alignment.interval);
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
