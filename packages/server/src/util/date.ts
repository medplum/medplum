// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Date/Interval helper functions
 * Largely following `date-fns` API design
 */

export type Interval = {
  start: Date;
  end: Date;
};

// Add the specified number of minutes to the given date.
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.valueOf() + minutes * 60 * 1000);
}

// Is the given time interval overlapping with another time interval? Adjacent
// intervals do not count as overlapping unless inclusive is set to true.
export function areIntervalsOverlapping(left: Interval, right: Interval, options?: { inclusive: boolean }): boolean {
  if (options?.inclusive) {
    return left.start <= right.end && right.start <= left.end;
  }
  return left.start < right.end && right.start < left.end;
}

// Clamps a date to the lower bound with the start of the interval and the
// upper bound with the end of the interval.
// - When the date is less than the start of the interval, the start is returned.
// - When the date is greater than the end of the interval, the end is returned.
// - Otherwise the date is returned.
export function clamp(date: Date, interval: Interval): Date {
  if (date.valueOf() < interval.start.valueOf()) {
    return interval.start;
  }
  if (date.valueOf() > interval.end.valueOf()) {
    return interval.end;
  }
  return date;
}
