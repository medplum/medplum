// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Temporal } from 'temporal-polyfill';
import type { Interval } from '../../../util/date';
import { areIntervalsOverlapping, clamp } from '../../../util/date';
import { isDefined } from '../../../util/types';
import type { SchedulingParameters } from './scheduling-parameters';

type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

// Tricky: support zero-based and one-based indexing by including Sunday on both ends.
// (Date#getDay() uses zero-based indexing and Temporal#dayOfWeek uses one-based indexing)
const dayNames: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function eachDayOfInterval(interval: Interval, timeZone: string): Temporal.ZonedDateTime[] {
  let t = Temporal.ZonedDateTime.from({
    year: interval.start.getFullYear(),
    month: interval.start.getMonth() + 1,
    day: interval.start.getDate(),
    timeZone,
  });

  const results: Temporal.ZonedDateTime[] = [];
  while (t.epochMilliseconds < interval.end.valueOf()) {
    results.push(t);
    t = t.add({ days: 1 });
  }
  return results;
}

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
 * @param interval - The Interval to return availability within
 * @param timeZone - The timezone to apply availability based on
 * @returns An array of intervals of availability
 */
export function resolveAvailability(
  schedulingParameters: SchedulingParameters,
  interval: Interval,
  timeZone: string
): Interval[] {
  return eachDayOfInterval(interval, timeZone).flatMap((dayStart) => {
    const dayOfWeek = dayNames[dayStart.dayOfWeek];
    return schedulingParameters.availability
      .filter((availability) => availability.dayOfWeek.includes(dayOfWeek))
      .flatMap((availability) =>
        availability.timeOfDay.map((timeOfDay) => {
          const [hour, minute, second] = timeOfDay.split(':').map(Number);
          const start = dayStart.withPlainTime({ hour, minute, second });
          const end = start.add({ minutes: availability.duration });
          const availableInterval = { start: new Date(start.epochMilliseconds), end: new Date(end.epochMilliseconds) };
          return intersectIntervals(availableInterval, interval);
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
      currentStart = blocked.end.valueOf() > currentStart.valueOf() ? blocked.end : currentStart;

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
