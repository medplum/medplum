// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, isDefined } from '@medplum/core';
import type { Appointment, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum, useResourceModified } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { Range } from '../types/scheduling';
import { showErrorNotification } from '../utils/notifications';

export interface UseSchedulingResourcesResult {
  appointments: WithId<Appointment>[] | undefined;
  slots: WithId<Slot>[] | undefined;
  loading: boolean;
}

export interface UseSchedulingSlotsResult {
  slots: WithId<Slot>[] | undefined;
  loading: boolean;
}

export interface UseSchedulingAppointmentsResult {
  appointments: WithId<Appointment>[] | undefined;
  loading: boolean;
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
 * @returns The loaded Slots (undefined until the first fetch resolves) and a loading flag.
 */
export function useSchedulingSlots(schedules: WithId<Schedule>[], range: Range | undefined): UseSchedulingSlotsResult {
  const medplum = useMedplum();
  const [slots, setSlots] = useState<WithId<Slot>[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // The predicate that scopes this calendar's data. The FHIR search and the
  // `useResourceModified` handler both use this so the optimistic updates stay consistent
  // with what a refetch would return. Deduped so duplicate schedules don't issue the same
  // Slot query twice.
  const scheduleRefs = [...new Set(schedules.map((schedule) => getReferenceString(schedule)))];

  // Stable keys so the searches below only re-run when the set of predicates actually
  // changes, rather than on every render when the parent passes a new array instance.
  const scheduleRefsKey = scheduleRefs.join(',');

  // Keep the calendar's slots in sync with any Slot this client modifies, e.g. the
  // slots created when booking a visit from the FindPane or soft-deleted when cancelling
  // one from the appointment details drawer.
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
      // `create` prepends the new slot; `update`/`patch` replace it in place and leave
      // an unloaded range untouched.
      if (event.operation === 'create') {
        const current = state ?? [];
        return current.some((existing) => existing.id === slot.id) ? current : [slot, ...current];
      }
      return state?.map((existing) => (existing.id === slot.id ? slot : existing));
    });
  });

  useEffect(() => {
    if (!range) {
      return () => {};
    }
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading flag
    setLoading(true);

    // Emit one Slot search per schedule so MedplumClient can cache each schedule's
    // results independently.
    Promise.all(
      scheduleRefs.map((scheduleRef) =>
        medplum.searchResources('Slot', [
          ['_count', '1000'],
          ['schedule', scheduleRef],
          ['start', `ge${range.start.toISOString()}`],
          ['start', `le${range.end.toISOString()}`],
          ['status:not', 'entered-in-error'],
        ])
      )
    )
      .then((results) => active && setSlots(results.flat()))
      .catch((error: unknown) => active && showErrorNotification(error))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      setLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleRefsKey captures scheduleRefs
  }, [medplum, scheduleRefsKey, range]);

  return {
    slots,
    loading,
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
 * @returns The loaded Appointments (undefined until the first fetch resolves) and a loading flag.
 */
export function useSchedulingAppointments(
  schedules: WithId<Schedule>[],
  range: Range | undefined
): UseSchedulingAppointmentsResult {
  const medplum = useMedplum();
  const [appointments, setAppointments] = useState<WithId<Appointment>[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // The predicate that scopes this calendar's data. The FHIR search and the
  // `useResourceModified` handler both use this so the optimistic updates stay consistent
  // with what a refetch would return. Deduped so schedules that share an actor don't
  // issue the same Appointment query twice.
  const actorRefs = [
    ...new Set(schedules.flatMap((schedule) => schedule.actor.map((ref) => getReferenceString(ref))).filter(isDefined)),
  ];

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
        const current = state ?? [];
        return current.some((existing) => existing.id === appointment.id) ? current : [...current, appointment];
      }
      return state?.map((existing) => (existing.id === appointment.id ? appointment : existing));
    });
  });

  // Find appointments visible in the current range
  useEffect(() => {
    if (actorRefs.length === 0 || !range) {
      return () => {};
    }
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading flag
    setLoading(true);

    // Emit one Appointment search per schedule actor, again so each schedule's results
    // can be cached independently.
    Promise.all(
      actorRefs.map((actorRef) =>
        medplum.searchResources('Appointment', [
          ['_count', '1000'],
          ['actor', actorRef],
          ['date', `ge${range.start.toISOString()}`],
          ['date', `le${range.end.toISOString()}`],
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
      })
      .catch((error: unknown) => active && showErrorNotification(error))
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      setLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actorRefsKey captures actorRefs
  }, [medplum, actorRefsKey, range]);

  return {
    appointments,
    loading,
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
 * @returns The loaded Slots and Appointments (each undefined until its first fetch resolves)
 *   and a combined loading flag.
 */
export function useSchedulingResources(
  schedules: WithId<Schedule>[],
  range: Range | undefined
): UseSchedulingResourcesResult {
  const slotsResult = useSchedulingSlots(schedules, range);
  const appointmentsResult = useSchedulingAppointments(schedules, range);

  return {
    slots: slotsResult.slots,
    appointments: appointmentsResult.appointments,
    loading: slotsResult.loading || appointmentsResult.loading,
  };
}
