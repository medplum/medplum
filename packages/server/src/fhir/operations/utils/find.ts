// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ContextFn, Interval } from 'date-fns';
import { areIntervalsOverlapping, clamp, add as dateAdd, eachDayOfInterval } from 'date-fns';
import { isDefined } from '../../../util/types';
import type { SchedulingParameters } from './scheduling-parameters';

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
