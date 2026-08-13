// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * A span of days, inclusive of both ends.
 */
export interface DateRange {
  readonly start: Date;
  readonly end: Date;
}

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
 * Returns local midnight on a date's own day.
 * @param date - Any instant within the day.
 * @returns The start of that day.
 */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Returns whether a day falls before another, ignoring the time of day.
 * @param day - Local midnight of the day in question.
 * @param limit - The instant the day is measured against.
 * @returns True when the day ends before the limit.
 */
export function isBeforeDay(day: Date, limit: Date): boolean {
  return day.getTime() < startOfDay(limit).getTime();
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

/**
 * Returns whether a selection covers a span of days rather than a single day.
 * @param selected - The current selection, which may be absent.
 * @returns True when the selection is a range.
 */
export function isDateRange(selected: Date | DateRange | undefined): selected is DateRange {
  return !!selected && !(selected instanceof Date);
}

/**
 * Returns the day a shift-click measures its range from.
 *
 * A range keeps its start as the anchor, so repeated shift-clicks move only the
 * far end instead of the span walking away from where it began.
 * @param selected - The current selection, which may be absent.
 * @returns The anchor day, or undefined when nothing is selected yet.
 */
export function getRangeAnchor(selected: Date | DateRange | undefined): Date | undefined {
  if (!selected) {
    return undefined;
  }
  return isDateRange(selected) ? selected.start : selected;
}

/**
 * Returns the two days as a range, in the order a calendar reads them.
 * @param anchor - The day the range is measured from.
 * @param date - The day the range was swept to, on either side of the anchor.
 * @returns The range, earliest day first.
 */
export function toDateRange(anchor: Date, date: Date): DateRange {
  return isBeforeDay(startOfDay(date), anchor) ? { start: date, end: anchor } : { start: anchor, end: date };
}

/**
 * Returns whether a day is one the selection names outright.
 * @param day - Local midnight of the day in question.
 * @param selected - The current selection, which may be absent.
 * @returns True for the selected day, or for either end of a selected range.
 */
export function isSelectedDay(day: Date, selected: Date | DateRange | undefined): boolean {
  if (isDateRange(selected)) {
    return isSameDay(day, selected.start) || isSameDay(day, selected.end);
  }
  return isSameDay(day, selected);
}

/**
 * Returns whether a day falls inside a selected range, between its two ends.
 * @param day - Local midnight of the day in question.
 * @param selected - The current selection, which may be absent.
 * @returns True only for the days a range spans over, never for its ends.
 */
export function isWithinDateRange(day: Date, selected: Date | DateRange | undefined): boolean {
  if (!isDateRange(selected)) {
    return false;
  }
  const time = startOfDay(day).getTime();
  return time > startOfDay(selected.start).getTime() && time < startOfDay(selected.end).getTime();
}
