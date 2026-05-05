// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Interval } from '../../../util/date';
import { addMinutes, clamp } from '../../../util/date';
import { normalizeIntervals, pairWithOverlaps } from './scheduling';

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

/**
 * Given an interval and slot duration and alignment information, return
 * intervals for each matching slot timing within that interval
 *
 * @param interval - The interval to find slots within
 * @param options - The alignment parameters
 * @param options.alignment - An hour divisor to align to; should be in range [1, 60]
 * @param options.offsetMinutes - A number of minutes to offset the alignment by
 * @param options.durationMinutes - How long each slot should last
 * @param options.maxCount - Maximum number of intervals to find
 * @returns An array of aligned slot intervals
 */
export function findAlignedSlotTimes(
  interval: Interval,
  options: {
    alignment: number;
    offsetMinutes: number;
    durationMinutes: number;
    maxCount?: number;
  }
): Interval[] {
  if (options.alignment < 1) {
    throw new Error(`Invalid alignment; must be in range [1,60], got ${options.alignment}`);
  }

  const firstMinuteStart = advanceToMinuteMark(interval.start);

  // Find how much we need to shift the interval start to hit an alignment
  const remainder = mod(firstMinuteStart.getMinutes() - options.offsetMinutes, options.alignment);
  const toAlign = remainder === 0 ? 0 : options.alignment - remainder;

  // set start/end to the first interval boundaries
  let start = addMinutes(firstMinuteStart, toAlign);
  let end = addMinutes(start, options.durationMinutes);

  // Find all aligned slots within the interval
  const results = [];
  while (end <= interval.end) {
    results.push({ start, end });
    start = addMinutes(start, options.alignment);
    end = addMinutes(start, options.durationMinutes);
    if (options.maxCount && results.length >= options.maxCount) {
      break;
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
