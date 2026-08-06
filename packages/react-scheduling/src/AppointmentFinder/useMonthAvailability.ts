// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, isDefined, normalizeErrorString } from '@medplum/core';
import type { Appointment, HealthcareService, Reference, Schedule } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import { endOfDay, endOfMonth, findAppointments, startOfMonth } from './AppointmentFinder.utils';

/**
 * The most times one leg of the scan asks for. The ceiling `$find` allows, and
 * what tells a scan apart from the search whose times are being read.
 */
export const MONTH_SCAN_COUNT = 1000;

/**
 * The most days one leg of the scan covers.
 *
 * A month is scanned in two requests rather than one, for two reasons: `$find`
 * refuses a window longer than 31 days, which is exactly the length of the
 * longest months, and each request is capped at a thousand times, which a busy
 * month of short slots can reach. Half a month at a time leaves that cap well
 * clear of any real schedule.
 */
const SCAN_CHUNK_DAYS = 16;

export interface MonthAvailabilityCriteria {
  readonly service: Reference<HealthcareService>;
  /** Schedules to intersect, the same ones the visible search asks about. */
  readonly schedules: readonly Reference<Schedule>[];
  /** Any day of the month to scan. */
  readonly month: Date;
  /** Earliest instant worth offering, from the notice period. */
  readonly from?: Date;
}

export interface MonthAvailability {
  /** Every time found in the month, for the caller to group into days. */
  readonly appointments: readonly Appointment[];
  readonly loading: boolean;
  readonly error: Error | undefined;
  /**
   * How far into the month the answer can be trusted. Short of the month's end
   * when a request came back full, where the times after it were never counted
   * and their days would otherwise read as having nothing.
   */
  readonly checkedThrough: Date | undefined;
}

/**
 * Finds which days of a month have any time on offer.
 *
 * Kept apart from the search whose times are being read, because the two are
 * asked different questions. A scheduler reading Tuesday wants every time on
 * Tuesday; the calendar beside it wants one time per day across the month, so
 * that the days worth clicking are the ones that are marked. Running one query
 * for both would mean either narrowing the month to the day being read — which
 * is what makes a calendar go blank as soon as it is used — or fetching a month
 * of times to show one day of them.
 *
 * The scan follows the month on display rather than the day chosen, so paging to
 * October marks October, and clicking around inside a month costs nothing.
 *
 * @param criteria - What to scan for, or undefined to scan for nothing.
 * @returns The times found across the month, and how far it was scanned.
 */
export function useMonthAvailability(criteria: MonthAvailabilityCriteria | undefined): MonthAvailability {
  const medplum = useMedplum();
  const [appointments, setAppointments] = useState<readonly Appointment[]>([]);
  const [checkedThrough, setCheckedThrough] = useState<Date>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const serviceReference = criteria && getReferenceString(criteria.service);
  const monthIso = criteria && startOfMonth(criteria.month).toISOString();
  const fromIso = criteria?.from?.toISOString();

  // Collapsed to a string, so a parent handing over an equal array on every
  // render does not rescan the month.
  const schedulesKey = (criteria?.schedules ?? [])
    .map((reference) => reference.reference)
    .filter(isDefined)
    .join(',');

  useEffect(() => {
    const schedules = schedulesKey.split(',').filter(Boolean);
    const from = fromIso ? new Date(fromIso) : undefined;
    const window = monthIso ? getScanWindow(new Date(monthIso), from) : undefined;

    if (!serviceReference || !window || schedules.length === 0) {
      setAppointments([]);
      setCheckedThrough(undefined);
      setError(undefined);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(undefined);

    Promise.all(
      chunkWindow(window).map(async (chunk) =>
        findAppointments(
          medplum,
          { service: serviceReference, schedules, ...chunk, count: MONTH_SCAN_COUNT },
          { signal: controller.signal }
        )
      )
    )
      .then((results) => {
        if (controller.signal.aborted) {
          return;
        }
        setAppointments(results.flatMap((result) => result.appointments));
        setCheckedThrough(getCheckedThrough(results, window.end));
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setAppointments([]);
        setCheckedThrough(undefined);
        setError(new Error(normalizeErrorString(reason), { cause: reason }));
        setLoading(false);
      });

    return () => controller.abort();
  }, [medplum, serviceReference, monthIso, fromIso, schedulesKey]);

  return { appointments, loading, error, checkedThrough };
}

interface ScanWindow {
  readonly start: Date;
  readonly end: Date;
}

/**
 * Returns the part of a month worth scanning.
 *
 * Days already gone, or inside the notice period, hold nothing bookable and are
 * left out rather than asked about — which is also what leaves a past month
 * unmarked rather than searched.
 *
 * @param month - The month on display.
 * @param from - Earliest instant worth offering.
 * @returns The window to scan, or undefined when the month holds nothing bookable.
 */
function getScanWindow(month: Date, from: Date | undefined): ScanWindow | undefined {
  const monthStart = startOfMonth(month);
  const start = from && from > monthStart ? from : monthStart;
  const end = endOfMonth(month);
  return end > start ? { start, end } : undefined;
}

/**
 * Splits a window into requests `$find` will accept.
 * @param window - The whole window to scan.
 * @returns One window per request, in order.
 */
function chunkWindow(window: ScanWindow): ScanWindow[] {
  const chunks: ScanWindow[] = [];
  let start = window.start;
  while (start < window.end) {
    const limit = endOfDay(addDays(start, SCAN_CHUNK_DAYS - 1));
    const end = limit < window.end ? limit : window.end;
    chunks.push({ start, end });
    start = new Date(end.getTime() + 1);
  }
  return chunks;
}

/**
 * Works out how far the scan can be trusted.
 *
 * A request that came back full stopped counting where the count ran out, so the
 * month is only known as far as the last time it returned. The earliest such
 * point across the requests is where the answer stops being complete.
 *
 * @param results - What each request returned.
 * @param end - The end of the window, when nothing was cut short.
 * @returns The last instant the scan covered.
 */
function getCheckedThrough(
  results: readonly { appointments: readonly Appointment[]; truncated: boolean }[],
  end: Date
): Date {
  // Compared as instants rather than as the strings they arrive as: `instant`
  // permits an offset other than `Z` and optional fractional seconds, either of
  // which puts lexicographic order at odds with chronological order.
  const cutOffs = results
    .filter((result) => result.truncated)
    .map((result) =>
      result.appointments
        .map((appointment) => appointment.start)
        .filter(isDefined)
        .map((start) => new Date(start).getTime())
    )
    .filter((starts) => starts.length > 0)
    .map((starts) => Math.max(...starts));
  return cutOffs.length === 0 ? end : new Date(Math.min(...cutOffs));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
