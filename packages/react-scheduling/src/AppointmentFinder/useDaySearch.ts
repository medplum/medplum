// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Appointment, HealthcareService } from '@medplum/fhirtypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DateTimeRange } from '../types';
import type { ActorCombination } from './AppointmentFinder.schedules';
import type { AppointmentDay } from './AppointmentFinder.times';
import {
  addDays,
  endOfDay,
  enumerateDateRange,
  getFindWindowError,
  groupAppointmentsByDay,
  isSameDay,
} from './AppointmentFinder.times';
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
  readonly shown: DateTimeRange;
  /** The day picked, or undefined when a stretch of days was picked instead. */
  readonly picked: Date | undefined;
  /** The days on show, grouped by day and actor set, days that offered nothing included. */
  readonly days: readonly AppointmentDay[];
  /** Whether any day on show offered a time at all. */
  readonly anyTimes: boolean;
  /** True while the first window is out, when there is nothing yet to show. */
  readonly pending: boolean;
  /** True while any window is out, a further one over days already shown included. */
  readonly loading: boolean;
  /** Set only when every combination failed. */
  readonly error: Error | undefined;
  /** A window `$find` will not answer, caught before the request is made. */
  readonly windowError: string | undefined;
  /** Opens the search on one day. */
  readonly chooseDay: (date: Date) => void;
  /** Opens the search on a stretch of days, asking about all of them at once. */
  readonly chooseRange: (start: Date, end: Date) => void;
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
 * @returns The days on show with their times, load and error state, and the four ways in.
 */
export function useDaySearch(options: UseDaySearchOptions): UseDaySearchResult {
  const { service, combinations, timezone, defaultStart, onDaysChanged } = options;

  const [daySearch, setDaySearch] = useState<DaySearch>(() => openDaySearch(defaultStart ?? new Date()));

  // Held in a ref so every handler below can be stable whatever the caller passes:
  // `chooseRange` in particular is subscribed to a pointer drag already under way.
  const onDaysChangedRef = useRef(onDaysChanged);
  useEffect(() => {
    onDaysChangedRef.current = onDaysChanged;
  }, [onDaysChanged]);

  const windowError = getFindWindowError(daySearch.range);

  // Gated here rather than by the caller, which cannot know the window is unanswerable
  // until this hook has said so.
  const search = useProposedAppointments({
    service,
    combinations: windowError ? [] : combinations,
    range: daySearch.range,
    count: TIMES_PER_DAY * enumerateDateRange(daySearch.range).length,
  });

  // While a further window is loading, `search.appointments` is that window's
  // in-flight result, not yet part of `found`.
  const times = useMemo(
    () => (search.loading ? daySearch.found : [...daySearch.found, ...search.appointments]),
    [search.loading, search.appointments, daySearch.found]
  );

  const shown = useMemo(
    () => ({ start: daySearch.first.start, end: daySearch.range.end }),
    [daySearch.first.start, daySearch.range.end]
  );

  // Passing `shown` lists empty days too, so a day that came back with nothing still
  // shows up rather than looking like nobody asked about it.
  const days = useMemo(() => groupAppointmentsByDay(times, timezone, shown), [times, timezone, shown]);

  const chooseDay = useCallback((date: Date): void => {
    setDaySearch(openDaySearch(date));
    onDaysChangedRef.current?.();
  }, []);

  const chooseRange = useCallback((start: Date, end: Date): void => {
    setDaySearch(openDaySearch(start, end));
    onDaysChangedRef.current?.();
  }, []);

  // `search.appointments` is the settled result of the current window rather than an
  // in-flight one, because the control that calls this is disabled while `loading`.
  const showMoreDays = useCallback((): void => {
    setDaySearch((previous) => ({
      first: previous.first,
      range: nextWindow(previous.range),
      found: [...previous.found, ...search.appointments],
      extended: true,
    }));
  }, [search.appointments]);

  // `first` is carried over, so the days picked stay picked and `onDaysChanged` does not
  // fire: it is the extension that goes, not the choice of days.
  const reset = useCallback((): void => {
    setDaySearch((previous) => ({
      first: previous.first,
      range: previous.first,
      found: [],
      extended: false,
    }));
  }, []);

  return {
    shown,
    // Read off the first window rather than the days on show, so a day picked stays
    // marked as the one picked once "Show more days" has widened what is around it.
    picked: isSameDay(daySearch.first.start, daySearch.first.end) ? daySearch.first.start : undefined,
    days,
    anyTimes: days.some((day) => day.groups.length > 0),
    // A spinner rather than empty days: only while the first window is still out.
    pending: search.loading && !daySearch.extended,
    loading: search.loading,
    error: search.error,
    windowError,
    chooseDay,
    chooseRange,
    showMoreDays,
    reset,
  };
}

/** The days on offer, and the times the ones already answered came back with. */
interface DaySearch {
  /** The window the search opened on, which is what putting the added days away goes back to. */
  readonly first: DateTimeRange;
  /** The days being asked about now, which is the newest window alone. Both ends closed, as `$find` requires. */
  readonly range: DateTimeRange;
  /** Times the earlier windows offered, kept on screen while a further one is out. */
  readonly found: readonly Appointment[];
  /** Whether days beyond the first window have been asked for. */
  readonly extended: boolean;
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
  return { first: window, range: window, found: [], extended: false };
}

/**
 * Moves the search on to the days after the ones already asked about.
 * @param range - The window last asked about.
 * @returns The window following it, opening at midnight of the next day.
 */
function nextWindow(range: DateTimeRange): DateTimeRange {
  const next = addDays(range.end, 1);
  const start = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  return { start, end: endOfDay(addDays(start, MORE_DAYS - 1)) };
}
