// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, isDefined, normalizeErrorString } from '@medplum/core';
import type { Appointment, HealthcareService, Reference, Schedule } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { findAppointments, getFindWindow } from './AppointmentFinder.find';
import { getAppointmentKey } from './AppointmentFinder.times';

export interface AppointmentFindCriteria {
  readonly service: Reference<HealthcareService>;
  /**
   * The schedules to hold the appointment on. `$find` intersects them, so the
   * times returned are the times every one of them is free — a provider, a
   * second provider and a room describe one appointment, not three.
   */
  readonly schedules: readonly Reference<Schedule>[];
  readonly start: Date;
  /**
   * Where to stop searching. Leave it out for an open-ended search, which loads
   * a page at a time and keeps reaching further out as `loadMore` is called.
   */
  readonly end?: Date;
  /**
   * How many days each request covers, and how much further each `loadMore`
   * reaches. Defaults to a fortnight.
   */
  readonly pageDays?: number;
  /**
   * Maximum proposed appointments per request, passed through as `_count`.
   * Defaults to `DEFAULT_FIND_COUNT`, which is well past what a page shows.
   */
  readonly count?: number;
}

export interface UseAppointmentFindResult {
  readonly appointments: readonly Appointment[];
  /** Whether a fresh search is running, with nothing yet to show for it. */
  readonly loading: boolean;
  /** Whether a further page is running, with the times already loaded still shown. */
  readonly loadingMore: boolean;
  readonly error: Error | undefined;
  /** How far the search has reached, so a caller can say where the times stop. */
  readonly loadedThrough: Date | undefined;
  /** Whether any range is left to search. */
  readonly canLoadMore: boolean;
  /** Searches the next page, adding its times to the ones already loaded. */
  readonly loadMore: () => void;
  /**
   * Identifies the current search. It changes with the criteria but not as more
   * pages load, so a view can reopen itself for a new search and sit still for
   * an extended one.
   */
  readonly searchKey: string;
}

/**
 * Searches for bookable times with `Appointment/$find`.
 *
 * `$find` returns the times every schedule it is given is free for, so one
 * request answers a whole appointment however many actors it holds. This hook
 * owns the paging over that, along with aborting a request in flight when the
 * criteria change.
 *
 * A search covers a couple of weeks at a time rather than everything asked for
 * at once, and `loadMore` reaches out another page and adds what it finds to
 * what is already loaded. An open-ended search — no `end` at all — can be walked
 * as far as the user cares to look.
 *
 * Results are proposed, unpersisted Appointments carrying the `contained` Slots
 * that `$book` and `$hold` require, so they must be passed on unmodified.
 *
 * @param criteria - What to search for, or undefined to search for nothing.
 * @returns The proposed appointments, plus paging, load, and error state.
 */
export function useAppointmentFind(criteria: AppointmentFindCriteria | undefined): UseAppointmentFindResult {
  const medplum = useMedplum();
  const [appointments, setAppointments] = useState<readonly Appointment[]>([]);
  const [loadedThrough, setLoadedThrough] = useState<Date>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error>();
  const [page, setPage] = useState({ key: '', index: 0 });

  const serviceReference = criteria && getReferenceString(criteria.service);
  const startIso = criteria?.start.toISOString();
  const endIso = criteria?.end?.toISOString();
  const pageDays = criteria?.pageDays;
  const count = criteria?.count;

  // Callers build the list inline, so a parent re-render hands over a new array
  // holding the same references. Collapsing it to a string first means the
  // search restarts only when the schedules themselves change.
  const schedulesKey = (criteria?.schedules ?? [])
    .map((reference) => reference.reference)
    .filter(isDefined)
    .join(',');

  const searchKey = [serviceReference, startIso, endIso, pageDays, count, schedulesKey].join('|');

  // Deriving the page from the search it belongs to rather than resetting it in
  // an effect means a new search opens on its first page directly, instead of
  // requesting a page of the old search on the way there.
  const index = page.key === searchKey ? page.index : 0;

  const loadMore = useCallback(() => setPage({ key: searchKey, index: index + 1 }), [searchKey, index]);

  useEffect(() => {
    const searchEnd = endIso ? new Date(endIso) : undefined;
    const searchWindow = startIso ? getFindWindow(new Date(startIso), searchEnd, index, pageDays) : undefined;

    const schedules = schedulesKey.split(',').filter(Boolean);

    if (!serviceReference || !searchWindow || schedules.length === 0) {
      if (index === 0) {
        setAppointments([]);
        setLoadedThrough(undefined);
      }
      setError(undefined);
      setLoading(false);
      setLoadingMore(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(index === 0);
    setLoadingMore(index > 0);
    setError(undefined);

    findAppointments(
      medplum,
      {
        service: serviceReference,
        schedules,
        start: searchWindow.start,
        end: searchWindow.end,
        count,
      },
      { signal: controller.signal }
    )
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        // Later pages add to the earlier ones; a new search replaces them.
        setAppointments((previous) => unionAppointments(result.appointments, index > 0 ? previous : []));
        setLoadedThrough(searchWindow.end);
        setLoading(false);
        setLoadingMore(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (index === 0) {
          setAppointments([]);
          setLoadedThrough(undefined);
        }
        setError(new Error(normalizeErrorString(reason), { cause: reason }));
        setLoading(false);
        setLoadingMore(false);
      });

    return () => controller.abort();
  }, [medplum, serviceReference, startIso, endIso, pageDays, index, schedulesKey, count]);

  return {
    appointments,
    loading,
    loadingMore,
    error,
    loadedThrough,
    canLoadMore: !!loadedThrough && (!endIso || loadedThrough < new Date(endIso)),
    loadMore,
    searchKey,
  };
}

/**
 * Adds a page of results to the pages already loaded, dropping duplicates.
 *
 * Consecutive pages meet at the boundary of a day, so a time offered at that
 * boundary arrives twice and should read as one offer.
 *
 * @param loaded - The appointments just loaded.
 * @param previous - Appointments to keep, from the pages already loaded.
 * @returns The distinct proposed appointments, ordered by start time.
 */
function unionAppointments(loaded: readonly Appointment[], previous: readonly Appointment[] = []): Appointment[] {
  const seen = new Map<string, Appointment>();
  for (const appointment of [...previous, ...loaded]) {
    const key = getAppointmentKey(appointment);
    if (!seen.has(key)) {
      seen.set(key, appointment);
    }
  }
  return [...seen.values()].sort((left, right) => (left.start ?? '').localeCompare(right.start ?? ''));
}
