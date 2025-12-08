// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Slot } from '@medplum/fhirtypes';
import { Temporal } from 'temporal-polyfill';
import type { Interval } from '../../../util/date';
import { addMinutes, areIntervalsOverlapping, clamp } from '../../../util/date';
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
    const last = acc.at(-1);

    // base case: push the first interval onto the accumulator.
    if (!last) {
      return [interval];
    }

    // Try to merge the current interval into the last one seen
    const merged = mergeIntervals(last, interval);
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
 * Linearly iterates over two normalized interval lists, returning each interval from listA
 * paired with all overlapping intervals from listB. Each interval in listA is returned exactly
 * once. Intervals in listB may be part of zero, one, or many result lists.
 *
 * @param listA - First normalized (sorted, non-overlapping) list of intervals
 * @param listB - Second normalized (sorted, non-overlapping) list of intervals
 * @returns An array of pairs, each containing an interval from listA and its overlapping intervals from listB
 */
function pairWithOverlaps(listA: Interval[], listB: Interval[]): [Interval, Interval[]][] {
  const result: [Interval, Interval[]][] = [];
  let indexB = 0;

  for (const a of listA) {
    // Skip intervals in listB that end before a starts
    while (indexB < listB.length && listB[indexB].end <= a.start) {
      indexB++;
    }

    // Collect all overlapping intervals from listB, tracking where to resume for the next `a`
    const overlaps: Interval[] = [];
    let nextStartIndex = indexB;
    for (let i = indexB; i < listB.length && listB[i].start < a.end; i++) {
      overlaps.push(listB[i]);
      if (listB[i].end <= a.end) {
        // This interval is fully consumed by `a`, so future iterations can skip it
        nextStartIndex = i + 1;
      }
    }

    indexB = nextStartIndex;

    result.push([a, overlaps]);
  }

  return result;
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

  for (const [available, blocks] of pairWithOverlaps(availableIntervals, blockedIntervals)) {
    let currentStart = available.start;

    for (const blocked of blocks) {
      if (currentStart < blocked.start) {
        result.push({ start: currentStart, end: blocked.start });
      }
      if (blocked.end.valueOf() > currentStart.valueOf()) {
        currentStart = blocked.end;
      }
    }

    if (currentStart < available.end) {
      result.push({ start: currentStart, end: available.end });
    }
  }

  return result;
}

/**
 * Applies overrides from existing Slots to an availability window
 *
 * @param availability - Ranges of available time
 * @param slots - Slot resources to consider
 * @param range - Interval of time to restrict availability to
 * @returns Updated availability information
 */
export function applyExistingSlots(availability: Interval[], slots: Slot[], range: Interval): Interval[] {
  const freeSlotIntervals = slots
    .filter((slot) => slot.status === 'free')
    .map((slot) => intersectIntervals({ start: new Date(slot.start), end: new Date(slot.end) }, range))
    .filter(isDefined);

  const busySlotIntervals = normalizeIntervals(
    slots
      .filter((slot) => slot.status === 'busy' || slot.status === 'busy-unavailable')
      .map((slot) => ({ start: new Date(slot.start), end: new Date(slot.end) }))
  );
  const allAvailability = normalizeIntervals(availability.concat(freeSlotIntervals));
  return removeAvailability(allAvailability, busySlotIntervals);
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
 * @returns An array of aligned slot intervals
 */
export function findAlignedSlotTimes(
  interval: Interval,
  options: {
    alignment: number;
    offsetMinutes: number;
    durationMinutes: number;
  }
): Interval[] {
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
  }
  return results;
}

/**
 * Given scheduling parameters and availability information, compute the slot
 * times within those availability windows, accounting for things like buffer
 * time and alignment requirements.
 *
 * @param schedulingParameters - The SchedulingParameters definition to use
 * @param availability - An array of intervals to consider
 * @returns An array of slot intervals
 */
export function findSlotTimes(schedulingParameters: SchedulingParameters, availability: Interval[]): Interval[] {
  const alignmentOptions = {
    // Search for slots that are large enough to include the duration with any
    // buffer before/after included.
    durationMinutes:
      schedulingParameters.duration + schedulingParameters.bufferBefore + schedulingParameters.bufferAfter,
    alignment: schedulingParameters.alignmentInterval,
    // Shift our search alignment by any `bufferBefore`; Example: if we are
    // trying to find a slot at :30 with a 10 minute bufferBefore free, we need
    // to find slots starting at :20 (with the buffer included in the duration)
    offsetMinutes: schedulingParameters.alignmentOffset - schedulingParameters.bufferBefore,
  };
  return availability
    .flatMap((interval) => findAlignedSlotTimes(interval, alignmentOptions))
    .map((interval) => ({
      start: addMinutes(interval.start, schedulingParameters.bufferBefore),
      end: addMinutes(interval.end, -1 * schedulingParameters.bufferAfter),
    }));
}
