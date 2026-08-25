// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, isDefined, isError, normalizeErrorString } from '@medplum/core';
import type { Appointment, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum, useResourceModified } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import type { DateTimeRange } from './types';

// Whether an instant falls within the loaded range, matching the inclusive `ge`/`le`
// bounds of the searches below. Used to keep created resources from a live update out of
// state when they fall outside the range of the hook — a refetch wouldn't return
// them, so appending them would drift from what the search reflects.
function isWithinRange(instant: string | undefined, range: DateTimeRange | undefined): boolean {
  if (!instant || !range) {
    return false;
  }
  const time = new Date(instant).getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
}

function toError(reason: unknown): Error {
  return isError(reason) ? reason : new Error(normalizeErrorString(reason), { cause: reason });
}

export interface UseSchedulingResourcesResult {
  readonly appointments: WithId<Appointment>[] | undefined;
  readonly slots: WithId<Slot>[] | undefined;
  readonly loading: boolean;
  /** Set when a search failed. What loaded before the failure is left in place. */
  readonly error: Error | undefined;
}

export interface UseSchedulingSlotsResult {
  readonly slots: WithId<Slot>[] | undefined;
  readonly loading: boolean;
  /** Set when a search failed. What loaded before the failure is left in place. */
  readonly error: Error | undefined;
}

export interface UseSchedulingAppointmentsResult {
  readonly appointments: WithId<Appointment>[] | undefined;
  readonly loading: boolean;
  /** Set when a search failed. What loaded before the failure is left in place. */
  readonly error: Error | undefined;
}

/**
 * Loads the Slots for a set of schedules within a date range and keeps them live.
 *
 * Emits one Slot search per schedule so MedplumClient can cache each schedule's results
 * independently, then subscribes via `useResourceModified` so Slots this client creates,
 * updates, or deletes are reflected optimistically without a refetch.
 *
 * @param schedules - The schedules whose Slots should be loaded.
 * @param range - The date range to search within; no search runs while this is undefined.
 * @returns The loaded Slots (undefined until the first fetch resolves), a loading flag, and
 *   the error from a failed search.
 */
export function useSchedulingSlots(
  schedules: readonly WithId<Schedule>[],
  range: DateTimeRange | undefined
): UseSchedulingSlotsResult {
  const medplum = useMedplum();
  const [slots, setSlots] = useState<WithId<Slot>[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // The predicate that scopes this calendar's data. The FHIR search and the
  // `useResourceModified` handler both use this so the optimistic updates stay consistent
  // with what a refetch would return. Deduped so duplicate schedules don't issue the same
  // Slot query twice.
  const scheduleRefs = [...new Set(schedules.map((schedule) => getReferenceString(schedule)))];

  // Stable keys so the searches below only re-run when the set of predicates actually
  // changes, rather than on every render when the parent passes a new array instance.
  const scheduleRefsKey = scheduleRefs.join(',');
  const rangeStart = range?.start?.toISOString();
  const rangeEnd = range?.end?.toISOString();

  // Keep the calendar's slots in sync with any Slot this client modifies, e.g. the
  // slots written when booking a visit or soft-deleted when cancelling one.
  useResourceModified('Slot', (event) => {
    if (event.operation === 'delete') {
      // Deletes don't carry a resource, only the id of what went away.
      if (event.id) {
        setSlots((state) => state?.filter((slot) => slot.id !== event.id));
      }
      return;
    }

    const slot = event.resource;
    if (!slot) {
      return;
    }
    // Ignore slots that belong to a schedule other than the ones shown here.
    if (!slot.schedule.reference || !scheduleRefs.includes(slot.schedule.reference)) {
      return;
    }

    setSlots((state) => {
      // `create` appends the new slot when it lands in hook's `range`; `update`/`patch`
      // replace it in place and leave an unloaded range untouched.
      if (event.operation === 'create') {
        if (!isWithinRange(slot.start, range)) {
          return state;
        }
        const current = state ?? [];
        return current.some((existing) => existing.id === slot.id) ? current : [...current, slot];
      }
      return state?.map((existing) => (existing.id === slot.id ? slot : existing));
    });
  });

  useEffect(() => {
    if (!rangeStart || !rangeEnd) {
      return () => {};
    }
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading flag
    setLoading(true);

    const refs = scheduleRefsKey.split(',');

    // Emit one Slot search per schedule so MedplumClient can cache each schedule's
    // results independently.
    Promise.all(
      refs.map((scheduleRef) =>
        medplum.searchResources('Slot', [
          ['_count', '1000'],
          ['schedule', scheduleRef],
          ['start', `ge${rangeStart}`],
          ['start', `le${rangeEnd}`],
          ['status:not', 'entered-in-error'],
        ])
      )
    )
      .then((results) => {
        if (active) {
          setSlots(results.flat());
          setError(undefined);
        }
      })
      .catch((reason: unknown) => active && setError(toError(reason)))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      setLoading(false);
    };
  }, [medplum, scheduleRefsKey, rangeStart, rangeEnd]);

  return {
    slots,
    loading,
    error,
  };
}

/**
 * Loads the Appointments for a set of schedules within a date range and keeps them live.
 *
 * Searches by the schedules' actors, deduping shared actors so each is queried once, and
 * merges the per-actor results by id. Subscribes via `useResourceModified` so Appointments
 * this client creates, updates, or deletes are reflected optimistically without a refetch.
 *
 * @param schedules - The schedules whose actors' Appointments should be loaded.
 * @param range - The date range to search within; no search runs while this is undefined
 *   or none of the schedules have an actor.
 * @returns The loaded Appointments (undefined until the first fetch resolves), a loading
 *   flag, and the error from a failed search.
 */
export function useSchedulingAppointments(
  schedules: readonly WithId<Schedule>[],
  range: DateTimeRange | undefined
): UseSchedulingAppointmentsResult {
  const medplum = useMedplum();
  const [appointments, setAppointments] = useState<WithId<Appointment>[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // The predicate that scopes this calendar's data. The FHIR search and the
  // `useResourceModified` handler both use this so the optimistic updates stay consistent
  // with what a refetch would return. Deduped so schedules that share an actor don't
  // issue the same Appointment query twice.
  const actorRefs = [
    ...new Set(schedules.flatMap((schedule) => schedule.actor.map((ref) => getReferenceString(ref))).filter(isDefined)),
  ];
  const rangeStart = range?.start?.toISOString();
  const rangeEnd = range?.end?.toISOString();

  // Stable keys so the searches below only re-run when the set of predicates actually
  // changes, rather than on every render when the parent passes a new array instance.
  const actorRefsKey = actorRefs.join(',');

  // Keep the calendar's appointments in sync with any Appointment this client
  // modifies.
  useResourceModified('Appointment', (event) => {
    if (event.operation === 'delete') {
      if (event.id) {
        setAppointments((state) => state?.filter((appointment) => appointment.id !== event.id));
      }
      return;
    }

    const appointment = event.resource;
    if (!appointment) {
      return;
    }

    // Ignore appointments that don't involve any of these schedules' actors, mirroring
    // the `actor` filter used by the search below.
    if (!appointment.participant.some((p) => p.actor?.reference && actorRefs.includes(p.actor.reference))) {
      return;
    }

    setAppointments((state) => {
      if (event.operation === 'create') {
        if (!isWithinRange(appointment.start, range)) {
          return state;
        }
        const current = state ?? [];
        return current.some((existing) => existing.id === appointment.id) ? current : [...current, appointment];
      }
      return state?.map((existing) => (existing.id === appointment.id ? appointment : existing));
    });
  });

  // Find appointments visible in the current range
  useEffect(() => {
    if (actorRefsKey.length === 0 || !rangeStart || !rangeEnd) {
      return () => {};
    }
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading flag
    setLoading(true);

    const refs = actorRefsKey.split(',');

    // Emit one Appointment search per schedule actor, again so each schedule's results
    // can be cached independently.
    Promise.all(
      refs.map((actorRef) =>
        medplum.searchResources('Appointment', [
          ['_count', '1000'],
          ['actor', actorRef],
          ['date', `ge${rangeStart}`],
          ['date', `le${rangeEnd}`],
        ])
      )
    )
      .then((results) => {
        if (!active) {
          return;
        }
        // The same appointment can involve actors from more than one schedule, so dedupe
        // by id when combining the per-schedule results.
        const byId = new Map<string, WithId<Appointment>>();
        for (const appointment of results.flat()) {
          byId.set(appointment.id, appointment);
        }
        setAppointments([...byId.values()]);
        setError(undefined);
      })
      .catch((reason: unknown) => active && setError(toError(reason)))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      setLoading(false);
    };
  }, [medplum, actorRefsKey, rangeStart, rangeEnd]);

  return {
    appointments,
    loading,
    error,
  };
}

/**
 * Loads both the Slots and Appointments for a set of schedules within a date range.
 *
 * A thin composition of {@link useSchedulingSlots} and {@link useSchedulingAppointments}
 * for callers that need both; `loading` is true while either underlying fetch is in flight.
 *
 * @param schedules - The schedules whose Slots and Appointments should be loaded.
 * @param range - The date range to search within; no search runs while this is undefined.
 * @returns The loaded Slots and Appointments (each undefined until its first fetch resolves),
 *   a combined loading flag, and whichever search failed first.
 */
export function useSchedulingResources(
  schedules: readonly WithId<Schedule>[],
  range: DateTimeRange | undefined
): UseSchedulingResourcesResult {
  const slotsResult = useSchedulingSlots(schedules, range);
  const appointmentsResult = useSchedulingAppointments(schedules, range);

  return {
    slots: slotsResult.slots,
    appointments: appointmentsResult.appointments,
    loading: slotsResult.loading || appointmentsResult.loading,
    error: slotsResult.error ?? appointmentsResult.error,
  };
}
