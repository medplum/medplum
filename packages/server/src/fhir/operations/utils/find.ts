// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Interval } from '../../../util/date';
import { addMinutes, areIntervalsOverlapping, clamp } from '../../../util/date';
import { normalizeIntervals, pairWithOverlaps } from './scheduling';

/**
 * Returns true when a prospective appointment's buffer time would land on `blocked` time.
 *
 * Buffer time cannot be overbooked, so `blocked` should be the time occupied by any
 * existing booking, regardless of the capacity that booking was made under. Intervals
 * are half-open, so buffer time abutting a booking does not conflict with it.
 *
 * @param interval - The prospective appointment, excluding its buffers
 * @param blocked - Intervals of exclusively occupied time
 * @param options - The buffers configured for the appointment
 * @param options.bufferBefore - Minutes of buffer preceding the appointment
 * @param options.bufferAfter - Minutes of buffer following the appointment
 * @returns True when the appointment cannot be buffered
 */
export function bufferTimeConflicts(
  interval: Interval,
  blocked: Interval[],
  options: { bufferBefore: number; bufferAfter: number }
): boolean {
  const buffers: Interval[] = [];
  if (options.bufferBefore > 0) {
    buffers.push({ start: addMinutes(interval.start, -1 * options.bufferBefore), end: interval.start });
  }
  if (options.bufferAfter > 0) {
    buffers.push({ start: interval.end, end: addMinutes(interval.end, options.bufferAfter) });
  }
  return buffers.some((buffer) => blocked.some((block) => areIntervalsOverlapping(buffer, block)));
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
