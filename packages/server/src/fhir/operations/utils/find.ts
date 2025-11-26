// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ContextFn, Interval as DateFnsInterval } from 'date-fns';
import {
  addMinutes,
  areIntervalsOverlapping,
  clamp,
  add as dateAdd,
  isEqual as dateEqual,
  eachDayOfInterval,
  getMinutes,
  startOfMinute,
} from 'date-fns';
import { isDefined } from '../../../util/types';
import type { SchedulingParameters } from './scheduling-parameters';

type Interval = DateFnsInterval<Date, Date>;

type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const dayNames: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Given two intervals, return the interval that overlaps both of them. Returns undefined
 * if the intervals don't overlap at all.
 *
 * @param left - The first interval to consider
 * @param right - The second interval to consider
 * @returns An overlap interval, or undefined if none exists
 */
function intersectIntervals(left: Interval, right: Interval): Interval | undefined {
  if (!areIntervalsOverlapping(left, right)) {
    return undefined;
  }

  return { start: clamp(left.start, right), end: clamp(left.end, right) };
}

/**
 * Given two intervals, return the interval that overlaps either of them.
 * Returns undefined if the intervals don't overlap at all.
 *
 * @param left - The first interval to consider
 * @param right - The second interval to consider
 * @returns An overlap interval, or undefined if none exists
 */
function mergeIntervals(left: Interval, right: Interval): Interval | undefined {
  if (!areIntervalsOverlapping(left, right, { inclusive: true })) {
    return undefined;
  }

  const start = left.start.valueOf() < right.start.valueOf() ? left.start : right.start;
  const end = left.end.valueOf() > right.end.valueOf() ? left.end : right.end;

  return { start, end };
}

/**
 * Returns intervals of availability from a SchedulingParameters definition and a range of time
 *
 * @param schedulingParameters - The SchedulingParameters definition to evaluate
 * @param range - The Interval to return availability within
 * @param opts - Options to customize the result
 * @param opts.in - The timezone context to use in the function
 * @returns An array of intervals of availability
 */
export function resolveAvailability(
  schedulingParameters: SchedulingParameters,
  range: Interval,
  opts?: {
    in?: ContextFn<Date>;
  }
): Interval[] {
  return eachDayOfInterval(range, opts).flatMap((dayStart) => {
    const dayOfWeek = dayNames[dayStart.getDay()];
    return schedulingParameters.availability
      .filter((availability) => availability.dayOfWeek.includes(dayOfWeek))
      .flatMap((availability) =>
        availability.timeOfDay.map((timeOfDay) => {
          const [hours, minutes, seconds] = timeOfDay.split(':').map(Number);
          const start = dateAdd(dayStart, { hours, minutes, seconds });
          const end = dateAdd(start, { minutes: availability.duration });
          return intersectIntervals({ start, end }, range);
        })
      )
      .filter(isDefined);
  });
}

/**
 * Normalize a group of intervals for usage in resolution
 * - Sorts intervals by start time
 * - Merges overlapping intervals into a continuous interval
 *
 * @param intervals - The array of intervals to normalize
 * @returns An array of normalized intervals
 */
export function normalizeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length < 2) {
    return intervals;
  }
  const sorted = intervals.concat().sort((a, b) => a.start.valueOf() - b.start.valueOf());
  return sorted.reduce<Interval[]>((acc, interval) => {
    // base case: push the first interval onto the accumulator.
    if (acc.length === 0) {
      return [interval];
    }

    // Try to merge the current interval into the last one seen
    const merged = mergeIntervals(acc[acc.length - 1], interval);
    if (merged) {
      // Overlap found: update the last entry with the merged value
      acc[acc.length - 1] = merged;
    } else {
      // No overlap; append interval to end
      acc.push(interval);
    }
    return acc;
  }, []);
}

/**
 * @param availableIntervals - normalized (sorted, non-overlapping) intervals of available time
 * @param blockedIntervals - normalized (sorted, non-overlapping) intervals of blocked time
 * @returns Intervals of remaining available time after blocks are excluded
 */
export function removeAvailability(availableIntervals: Interval[], blockedIntervals: Interval[]): Interval[] {
  if (blockedIntervals.length === 0) {
    return availableIntervals;
  }

  const result: Interval[] = [];
  let blockedIndex = 0;

  for (const available of availableIntervals) {
    let currentStart = available.start;
    const availableEnd = available.end;

    // Skip blocked intervals that end before this available interval starts
    while (blockedIndex < blockedIntervals.length && blockedIntervals[blockedIndex].end <= currentStart) {
      blockedIndex++;
    }

    // Process all blocked intervals that overlap with the current available interval
    while (blockedIndex < blockedIntervals.length && blockedIntervals[blockedIndex].start < availableEnd) {
      const blocked = blockedIntervals[blockedIndex];

      // If there's a gap before the block, add it to results
      if (currentStart < blocked.start) {
        result.push({ start: currentStart, end: blocked.start });
      }

      // Update currentStart to after the block
      currentStart = blocked.end > currentStart ? blocked.end : currentStart;

      // If the block extends beyond the available interval, we're done with this available interval
      if (blocked.end >= availableEnd) {
        break;
      }

      blockedIndex++;
    }

    // If there's remaining time after processing all overlapping blocks
    if (currentStart < availableEnd) {
      result.push({ start: currentStart, end: availableEnd });
    }
  }

  return result;
}
// Given a date that could have a seconds / milliseconds component, return
// the input date if it does not have any, and the start of the next minute
// if it does.
function advanceToMinuteMark(date: Date): Date {
  const start = startOfMinute(date);
  return dateEqual(date, start) ? date : addMinutes(start, 1);
}

// JS `%` operator is "remainder", not "modulo", and can return negative numbers.
// Introducing our own mod function lets us guarantee that the result is in the
// range [0, d).
// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder
function mod(n: number, d: number): number {
  return ((n % d) + d) % d;
}

/**
 * Given an interval and slot alignment information, find all the matching
 * slots within that interval
 *
 * @param interval - The interval to find slots within
 * @param options - The alignment parameters
 * @param options.alignment - An hour divisor to align to; should be in range [1, 60]
 * @param options.offsetMinutes - A number of minutes to offset the alignment by
 * @param options.durationMinutes - How long each slot should last
 * @returns An array of aligned slot intervals
 */
export function findAlignedSlots(
  interval: Interval,
  options: {
    alignment: number;
    offsetMinutes: number;
    durationMinutes: number;
  }
): Interval[] {
  const firstMinuteStart = advanceToMinuteMark(interval.start);

  // Find how much we need to shift the interval start to hit an alignment
  const remainder = mod(getMinutes(firstMinuteStart) - options.offsetMinutes, options.alignment);
  const toAlign = remainder === 0 ? 0 : options.alignment - remainder;

  // set start/end to the first interval boundaries
  let start = dateAdd(firstMinuteStart, { minutes: toAlign });
  let end = dateAdd(start, { minutes: options.durationMinutes });

  // Find all aligned slots within the interval
  const results = [];
  while (end <= interval.end) {
    results.push({ start, end });
    start = dateAdd(start, { minutes: options.alignment });
    end = dateAdd(start, { minutes: options.durationMinutes });
  }
  return results;
}
