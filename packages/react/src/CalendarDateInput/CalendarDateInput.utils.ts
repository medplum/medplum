// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Returns a month display string (e.g. "January 2020").
 * @param date - Any date within the month.
 * @returns The month display string (e.g. "January 2020")
 */
export function getMonthString(date: Date): string {
  return date.toLocaleString('default', { month: 'long' }) + ' ' + date.getFullYear();
}

export function getStartMonth(): Date {
  return startOfMonth(new Date());
}

/**
 * Returns local midnight on the first of a date's month.
 * @param date - Any date within the month.
 * @returns The first day of that month.
 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Returns whether a day falls before another, ignoring the time of day.
 * @param day - Local midnight of the day in question.
 * @param limit - The instant the day is measured against.
 * @returns True when the day ends before the limit.
 */
export function isBeforeDay(day: Date, limit: Date): boolean {
  return day.getTime() < new Date(limit.getFullYear(), limit.getMonth(), limit.getDate()).getTime();
}

/**
 * Puts the ends of a range in order.
 * @param from - The day the range began on.
 * @param to - The day it has reached.
 * @returns The earlier day as the start.
 */
export function sortEnds(from: Date, to: Date): { start: Date; end: Date } {
  return from <= to ? { start: from, end: to } : { start: to, end: from };
}

/**
 * Returns whether two dates fall on the same day in the local timezone.
 * @param left - The first date.
 * @param right - The second date, which may be absent.
 * @returns True when both dates are present and share a calendar day.
 */
export function isSameDay(left: Date, right: Date | undefined): boolean {
  return (
    !!right &&
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
