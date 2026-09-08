// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Appointment, HealthcareService } from '@medplum/fhirtypes';
import { useCallback, useMemo, useState } from 'react';
import type { DateTimeRange } from '../types';
import type { ActorCombination } from './AppointmentFinder.schedules';
import type { AppointmentDay } from './AppointmentFinder.times';
import { addDays, endOfDay, getDayCount, groupAppointmentsByDay, startOfDay } from './AppointmentFinder.times';
import { useProposedAppointments } from './useProposedAppointments';

// How many days "Show more days" reaches further each time it is pressed.
const MORE_DAYS = 2;

// Generous heuristic for how many time results might be returned for a given day.
const TIMES_PER_DAY = 50;

export interface UseDaySearchOptions {
  /** The service being booked. No search runs without one. */
  readonly service: WithId<HealthcareService> | undefined;
  /** The sets of actors to search for. No search runs while this is empty. */
  readonly combinations: readonly ActorCombination[];
  /** The zone a day is read in, so a day breaks where the site says it does. */
  readonly timezone: string | undefined;
  /** The day to open on. Defaults to today. */
  readonly defaultStart?: Date;
  /** Fired when the days picked change, so the caller can drop what it chose from the old ones. */
  readonly onDaysChanged?: () => void;
}

export interface UseDaySearchResult {
  /** Every day on show, which is what the calendar marks. */
  readonly selectedDayRange: DateTimeRange;
  /** The days on show, grouped by day and actor set, days that offered nothing included. */
  readonly timeResultsByDay: readonly AppointmentDay[];
  /** Whether any day on show offered a time at all. */
  readonly hasTimes: boolean;
  /** True while the first window is out, when there is nothing yet to show. */
  readonly loadingFirstDays: boolean;
  /** True while a window over days beyond the ones already on show is out. */
  readonly loadingMoreDays: boolean;
  /** Set only when every combination's `$find` failed. */
  readonly findRequestError: Error | undefined;
  /** A window `$find` will not answer, caught before the request is made. */
  readonly windowError: string | undefined;
  /**
   * Opens the search on a stretch of days, asking about all of them at once.
   *
   * A day picked on its own is a stretch of one, so a click and a drag come in the same way.
   */
  readonly chooseDayRange: (start: Date, end?: Date) => void;
  /** Reaches further than the days already answered, keeping them on screen. */
  readonly showMoreDays: () => void;
  /**
   * Goes back to the days first picked, dropping the days "Show more days" reached for
   * and every time found so far. For a change that makes those times wrong — a different
   * service, or a different set of actors — rather than for a change of days.
   */
  readonly reset: () => void;
}

/**
 * Holds which days the time search covers, and the times they came back with.
 *
 * Owns the whole of that machine: the window being asked about, the windows already
 * answered, the `$find` request each one costs, and the grouping the caller renders. The
 * search is driven entirely by the window — advancing it *is* the request — so the state
 * and the fetch have to sit together to stay honest.
 *
 * @param options - The service, actors and zone to search against, and the day to open on.
 * @returns The days on show with their times, load and error state, and the three ways in.
 */
export function useDaySearch(options: UseDaySearchOptions): UseDaySearchResult {
  const { service, combinations, timezone, defaultStart, onDaysChanged } = options;

  const [daySearch, setDaySearch] = useState<DaySearch>(() => openDaySearch(defaultStart ?? new Date()));

  const search = useProposedAppointments({
    service,
    combinations,
    range: daySearch.range,
    count: TIMES_PER_DAY * getDayCount(daySearch.range.start, daySearch.range.end),
  });

  const selectedDayRange = useMemo(
    () => ({ start: daySearch.original.start, end: daySearch.range.end }),
    [daySearch.original.start, daySearch.range.end]
  );

  const { timeResultsByDay, hasTimes } = useMemo(() => {
    const times = search.loading ? daySearch.found : [...daySearch.found, ...search.appointments];
    const grouped = groupAppointmentsByDay(times, timezone, selectedDayRange);
    return { timeResultsByDay: grouped, hasTimes: grouped.some((day) => day.groups.length > 0) };
  }, [search.loading, search.appointments, daySearch.found, timezone, selectedDayRange]);

  const chooseDayRange = useCallback(
    (start: Date, end?: Date): void => {
      setDaySearch(openDaySearch(start, end));
      onDaysChanged?.();
    },
    [onDaysChanged]
  );

  // `search.appointments` is the settled result of the current window rather than an
  // in-flight one, because the control that calls this is disabled while `loadingMoreDays`.
  const showMoreDays = useCallback((): void => {
    setDaySearch((previous) => ({
      original: previous.original,
      range: nextWindow(previous.range),
      found: [...previous.found, ...search.appointments],
    }));
  }, [search.appointments]);

  // `original` is carried over, so the days picked stay picked and `onDaysChanged` does not
  // fire: it is the extension that goes, not the choice of days.
  const reset = useCallback((): void => {
    setDaySearch((previous) => ({
      original: previous.original,
      range: previous.original,
      found: [],
    }));
  }, []);

  // A spinner rather than empty days: only while the first window is still out, before
  // "Show more days" has moved the search past it.
  const loadingFirstDays = search.loading && daySearch.range.start.getTime() === daySearch.original.start.getTime();

  return {
    selectedDayRange,
    timeResultsByDay,
    hasTimes,
    loadingFirstDays,
    loadingMoreDays: search.loading && !loadingFirstDays,
    findRequestError: search.error,
    windowError: search.windowError,
    chooseDayRange,
    showMoreDays,
    reset,
  };
}

/** The days on offer, and the times the ones already answered came back with. */
interface DaySearch {
  /** The window the search opened on, which is what putting the added days away goes back to. */
  readonly original: DateTimeRange;
  /** The days being asked about now, which is the newest window alone. Both ends closed, as `$find` requires. */
  readonly range: DateTimeRange;
  /** Times the earlier windows offered, kept on screen while a further one is out. */
  readonly found: readonly Appointment[];
}

/**
 * `$find` treats `start` as a hard floor, so a day already under way starts from now
 * rather than midnight: the calendar hands back local midnight, and asking from there
 * would offer times that have already passed.
 * @param date - Any instant during the day.
 * @returns The later of that instant and now.
 */
function floorToNow(date: Date): Date {
  const now = new Date();
  return date > now ? date : now;
}

/**
 * Opens the search on a stretch of days, asking about all of them at once.
 *
 * A day picked on its own is a stretch of one, so a click and a drag open the same way.
 *
 * @param start - Any instant during the first day of the stretch.
 * @param end - Any instant during its last day. Defaults to the first day.
 * @returns The first window, with nothing found yet.
 */
function openDaySearch(start: Date, end: Date = start): DaySearch {
  const from = floorToNow(start);
  const window = { start: from, end: endOfDay(end > from ? end : from) };
  return { original: window, range: window, found: [] };
}

/**
 * Moves the search on to the days after the ones already asked about.
 * @param range - The window last asked about.
 * @returns The window following it, opening at midnight of the next day.
 */
function nextWindow(range: DateTimeRange): DateTimeRange {
  const start = startOfDay(addDays(range.end, 1));
  return { start, end: endOfDay(addDays(start, MORE_DAYS - 1)) };
}
