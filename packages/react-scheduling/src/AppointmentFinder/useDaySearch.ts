// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Appointment, HealthcareService } from '@medplum/fhirtypes';
import { useCallback, useMemo, useState } from 'react';
import type { DateTimeRange } from '../types';
import type { ActorCombination } from './AppointmentFinder.schedules';
import type { AppointmentDay } from './AppointmentFinder.times';
import {
  addDays,
  endOfDay,
  getDayCount,
  getZonedDayRange,
  groupAppointmentsByDay,
  startOfDay,
} from './AppointmentFinder.times';
import { useProposedAppointments } from './useProposedAppointments';

// How many days "Show more days" reaches further each time it is pressed.
const MORE_DAYS = 2;

// Generous heuristic for how many time results might be returned for a given day.
const TIMES_PER_DAY = 50;

/**
 * How many actor combinations one round of the search covers.
 *
 * Each one is a `$find` request of its own, and the product grows by
 * multiplication: one of five providers and one of five rooms is twenty-five
 * ways of holding the visit. Nobody reads twenty-five lists of times, and firing
 * them all costs the server twenty-five availability resolutions to answer a
 * question the first few usually settle. So a round is asked, and the rest are
 * asked for.
 */
const COMBINATION_WAVE = 6;

export interface UseDaySearchOptions {
  /** The service being booked. No search runs without one. */
  readonly service: WithId<HealthcareService> | undefined;
  /** The sets of actors to search for. No search runs while this is empty. */
  readonly combinations: readonly ActorCombination[];
  /** The zone a day is read in, so a day breaks where the site says it does. */
  readonly timezone: string | undefined;
  /** The day to open on. Defaults to today. */
  readonly defaultStart?: Date;
  /**
   * Fired when what is on show is replaced rather than added to, so the caller can
   * drop the time it chose out of results that no longer exist.
   */
  readonly onResultsReplaced?: () => void;
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
  /** How many of the actor combinations the times on show were searched for. */
  readonly searchedCombinationCount: number;
  /** How many ways of holding the visit the current selections come to in all. */
  readonly totalCombinationCount: number;
  /** Whether any combination has yet to be searched. */
  readonly hasMoreCombinations: boolean;
  /** Takes in another round of actor combinations. */
  readonly searchMoreCombinations: () => void;
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
 * @returns The days on show with their times, load and error state, and the ways in.
 */
export function useDaySearch(options: UseDaySearchOptions): UseDaySearchResult {
  const { service, combinations, timezone, defaultStart, onResultsReplaced } = options;

  const [daySearch, setDaySearch] = useState<DaySearch>(() => openDaySearch(defaultStart ?? new Date()));
  const [combinationLimit, setCombinationLimit] = useState(COMBINATION_WAVE);

  const searchedCombinations = useMemo(() => combinations.slice(0, combinationLimit), [combinations, combinationLimit]);

  // Derived rather than held, because the zone is not always known when a day is picked: a
  // search opened straight from the calendar has no service named yet.
  const siteWindow = useMemo(() => toSiteWindow(daySearch.range, timezone), [daySearch.range, timezone]);

  const search = useProposedAppointments({
    service,
    combinations: searchedCombinations,
    range: siteWindow,
    count: TIMES_PER_DAY * getDayCount(siteWindow.start, siteWindow.end),
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
      onResultsReplaced?.();
    },
    [onResultsReplaced]
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

  // `original` is carried over, so the days picked stay picked and `onResultsReplaced`
  // does not fire: it is the extension that goes, not the choice of days.
  const reset = useCallback((): void => {
    setDaySearch(backToFirstWindow);
    setCombinationLimit(COMBINATION_WAVE);
  }, []);

  // Unlike `reset`, this does announce itself: the times are refetched, so a chosen
  // one is replaced by an equal object the caller would no longer recognise. The days
  // paged in are kept and asked again rather than dropped, since asking for more
  // actors is not asking about fewer days.
  const searchMoreCombinations = useCallback((): void => {
    setCombinationLimit((limit) => limit + COMBINATION_WAVE);
    setDaySearch(reaskEveryDayOnShow);
    onResultsReplaced?.();
  }, [onResultsReplaced]);

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
    searchedCombinationCount: searchedCombinations.length,
    totalCombinationCount: combinations.length,
    hasMoreCombinations: combinations.length > searchedCombinations.length,
    searchMoreCombinations,
    chooseDayRange,
    showMoreDays,
    reset,
  };
}

/**
 * The days on offer, and the times the ones already answered came back with.
 *
 * Days are held as the viewer's own calendar writes them, which is how they are picked and
 * how they are drawn. Bounding them to the site is left to {@link toSiteWindow}.
 */
interface DaySearch {
  /** The days the search opened on, which is what putting the added days away goes back to. */
  readonly original: DateTimeRange;
  /** The days being asked about now, which is the newest stretch alone. */
  readonly range: DateTimeRange;
  /** Times the earlier windows offered, kept on screen while a further one is out. */
  readonly found: readonly Appointment[];
}

/**
 * Puts the search back on the days it opened on, dropping everything found since.
 * @param previous - The search as it stands.
 * @returns It, narrowed to the days first picked and holding no times.
 */
function backToFirstWindow(previous: DaySearch): DaySearch {
  return { original: previous.original, range: previous.original, found: [] };
}

/**
 * Puts every day on show back into one window, for the search to answer again.
 * (A wider round of combinations has to cover the days already on screen and not only
 * the newest stretch of them.)
 *
 * @param previous - The search as it stands.
 * @returns It, over every day it has reached, holding no times.
 */
function reaskEveryDayOnShow(previous: DaySearch): DaySearch {
  return {
    original: previous.original,
    range: { start: previous.original.start, end: previous.range.end },
    found: [],
  };
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
 * Bounds a stretch of days by the site's midnights, for `$find` to answer.
 * @param days - The days to ask about, on the viewer's calendar.
 * @param timezone - The site's IANA timezone. Defaults to the browser's.
 * @returns The window, both ends closed, as `$find` requires.
 */
function toSiteWindow(days: DateTimeRange, timezone?: string): DateTimeRange {
  return { start: getZonedDayRange(days.start, timezone).start, end: getZonedDayRange(days.end, timezone).end };
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
