// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EMPTY, getExtensionValue, isDefined } from '@medplum/core';
import type { Coding, Resource, Slot } from '@medplum/fhirtypes';
import { Temporal } from 'temporal-polyfill';
import type { Interval } from '../../../util/date';
import { areIntervalsOverlapping, clamp } from '../../../util/date';
import type { SchedulingParameters } from './scheduling-parameters';

// Tricky: support zero-based and one-based indexing by including Sunday on both ends.
// (Date#getDay() uses zero-based indexing and Temporal#dayOfWeek uses one-based indexing)
type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const dayNames: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function eachDayOfInterval(interval: Interval, timeZone: string): Temporal.ZonedDateTime[] {
  let t = Temporal.Instant.fromEpochMilliseconds(interval.start.valueOf())
    .toZonedDateTimeISO(timeZone)
    .withPlainTime({ hour: 0, minute: 0, second: 0, millisecond: 0 });

  const results: Temporal.ZonedDateTime[] = [];
  while (t.epochMilliseconds < interval.end.valueOf()) {
    results.push(t);
    t = t.add({ days: 1 });
  }
  return results;
}

function hasMatchingServiceType(slot: Slot, inputCoding: readonly Coding[]): boolean {
  const serviceType = slot.serviceType ?? [];
  // Slots without any service type are considered as "wildcard" slots that support
  // any service type codes
  if (serviceType.length === 0) {
    return true;
  }

  // If we didn't get a specific code to test for, we should only match wildcard slots,
  // which we ruled out above.
  if (inputCoding.length === 0) {
    return false;
  }

  const codes = new Set(inputCoding.map((coding) => `${coding.system}|${coding.code}`));

  // Check if there any of the Slot's service type codes match the input code
  for (const codeableConcept of serviceType) {
    if (codeableConcept.coding?.some((c) => codes.has(`${c.system}|${c.code}`))) {
      return true;
    }
  }
  return false;
}

export const TimezoneExtensionURI = 'http://hl7.org/fhir/StructureDefinition/timezone';

/**
 * Given a Resource, try to identify a relevant time zone from its extensions.
 * See https://build.fhir.org/ig/HL7/fhir-extensions/StructureDefinition-timezone.html
 *
 * @param resource - The Resource to examing
 * @returns string | undefined - The contents of the timezone extension
 */
export function getTimeZone(resource: Resource): string | undefined {
  return getExtensionValue(resource, TimezoneExtensionURI) as string | undefined;
}

/**
 * Given two intervals, return the interval that overlaps both of them. Returns undefined
 * if the intervals don't overlap at all.
 *
 * @param left - The first interval to consider
 * @param right - The second interval to consider
 * @returns An overlap interval, or undefined if none exists
 */
export function intersectIntervals(left: Interval, right: Interval): Interval | undefined {
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
 * @param params - input object
 * @param params.availability - Ranges of available time
 * @param params.slots - Slot resources to consider
 * @param params.range - Interval of time to restrict availability to
 * @param params.serviceType - Service type to check for "free" slots
 * @returns Updated availability information
 */
export function applyExistingSlots(params: {
  availability: Interval[];
  slots: Slot[];
  range: Interval;
  serviceType?: readonly Coding[];
}): Interval[] {
  const freeSlotIntervals = params.slots
    .filter((slot) => slot.status === 'free')
    .filter((slot) => hasMatchingServiceType(slot, params.serviceType ?? EMPTY))
    .map((slot) => intersectIntervals({ start: new Date(slot.start), end: new Date(slot.end) }, params.range))
    .filter(isDefined);

  const busySlotIntervals = normalizeIntervals(
    params.slots
      .filter(
        (slot) => slot.status === 'busy' || slot.status === 'busy-unavailable' || slot.status === 'busy-tentative'
      )
      .map((slot) => ({ start: new Date(slot.start), end: new Date(slot.end) }))
  );
  const allAvailability = normalizeIntervals(params.availability.concat(freeSlotIntervals));
  return removeAvailability(allAvailability, busySlotIntervals);
}
