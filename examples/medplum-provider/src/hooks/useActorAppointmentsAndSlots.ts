// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Appointment, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { Range } from '../types/scheduling';
import { showErrorNotification } from '../utils/notifications';

/**
 * Batched Appointment/Slot fetch across every actor currently displayed on
 * the Calendar screen (spec §4.3, §8) — a different access pattern from
 * `useMultiResourceFind` (which fans out one `$find` call per *combo* to
 * discover open slots). Here we already know exactly which actors are on
 * screen (their Schedules), so we issue one batched `Appointment` search
 * (comma-joined `actor` = OR across all currently-visible actors) and one
 * batched `Slot` search (comma-joined `schedule`), instead of one request
 * per actor — necessary once Room/Device swimlanes render alongside
 * Providers, to avoid an O(actors) request fan-out on every pan/zoom.
 * @param params - Fetch parameters.
 * @param params.schedules - The Schedules of every actor currently shown as a swimlane/column.
 * @param params.range - The visible date range.
 * @param params.refreshToken - Bump to force a refetch after a create/delete mutation.
 * @returns The batched appointments/slots for the visible actors + range, and a loading flag.
 */
export function useActorAppointmentsAndSlots(params: {
  schedules: WithId<Schedule>[];
  range: Range | undefined;
  // Bump to force a refetch after a mutation (create/delete Slot) — this hook
  // uses medplum.searchResources directly, which isn't invalidated by
  // medplum.invalidateSearches, so callers signal changes explicitly.
  refreshToken?: number;
}): { appointments: WithId<Appointment>[]; slots: WithId<Slot>[]; loading: boolean } {
  const { schedules, range, refreshToken } = params;
  const medplum = useMedplum();
  const [appointments, setAppointments] = useState<WithId<Appointment>[]>([]);
  const [slots, setSlots] = useState<WithId<Slot>[]>([]);
  const [loading, setLoading] = useState(false);

  const actorRefs = schedules.flatMap((s) => s.actor.map((a) => getReferenceString(a)).filter(Boolean) as string[]);
  const scheduleRefs = schedules.map((s) => getReferenceString(s)).filter(Boolean);
  // Keys change identity every render (new arrays), so key on their sorted
  // joined refs to avoid refetching when the same actor set is passed again.
  const actorKey = [...actorRefs].sort().join(',');
  const scheduleKey = [...scheduleRefs].sort().join(',');

  useEffect(() => {
    let active = true;

    if (!range || actorRefs.length === 0) {
      setAppointments([]);
      setSlots([]);
      return () => {};
    }

    setLoading(true);

    Promise.all([
      medplum.searchResources('Appointment', [
        ['_count', '1000'],
        ['actor', actorKey],
        ['date', `ge${range.start.toISOString()}`],
        ['date', `le${range.end.toISOString()}`],
      ]),
      medplum.searchResources('Slot', [
        ['_count', '1000'],
        ['schedule', scheduleKey],
        ['start', `ge${range.start.toISOString()}`],
        ['start', `le${range.end.toISOString()}`],
        ['status:not', 'entered-in-error'],
      ]),
    ])
      .then(([fetchedAppointments, fetchedSlots]) => {
        if (!active) {
          return;
        }
        setAppointments(fetchedAppointments);
        setSlots(fetchedSlots);
      })
      .catch((error: unknown) => {
        if (active) {
          showErrorNotification(error);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medplum, actorKey, scheduleKey, range?.start.getTime(), range?.end.getTime(), refreshToken]);

  return { appointments, slots, loading };
}
