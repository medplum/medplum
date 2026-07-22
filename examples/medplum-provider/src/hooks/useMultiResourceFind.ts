// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, isDefined } from '@medplum/core';
import type { Appointment, Bundle, HealthcareService } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { Range } from '../types/scheduling';
import type { ResourceCombo } from '../utils/scheduling';
import { showErrorNotification } from '../utils/notifications';

export type ComboSlot = {
  appointment: WithId<Appointment>;
  combo: ResourceCombo;
};

/**
 * Client-side combo orchestration for multi-resource Find & Book (spec
 * §4.2). `Appointment/$find` only intersects the exact set of Schedules
 * passed to it — it does not search across "any of N providers x any of M
 * rooms" combinations. This hook fans out one `$find` call per candidate
 * combo and merges the results into a single soonest-first slot list, with
 * the originating combo kept alongside each proposed Appointment.
 *
 * This is O(combos) `$find` calls — fine at demo-sized pool counts (the
 * caller is expected to cap `combos` via `cartesianCombos`), but is called
 * out explicitly as a demo-grade limitation, not a real search-side
 * combination strategy that would scale to a large multi-provider clinic.
 * @param params - Search parameters.
 * @param params.combos - Candidate resource combos to search (already criteria-filtered and capped).
 * @param params.healthcareService - The visit type being searched for.
 * @param params.range - The date range to search within.
 * @returns The merged, soonest-first slot list and a loading flag.
 */
export function useMultiResourceFind(params: {
  combos: ResourceCombo[];
  healthcareService: WithId<HealthcareService> | undefined;
  range: Range | undefined;
}): { slots: ComboSlot[] | undefined; loading: boolean } {
  const { combos, healthcareService, range } = params;
  const medplum = useMedplum();
  const [slots, setSlots] = useState<ComboSlot[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // Combos change identity every render (new arrays from cartesianCombos), so
  // key on their combo keys to avoid refetching when nothing meaningful changed.
  const comboKey = combos.map((c) => c.key).join(',');

  useEffect(() => {
    let running = true;

    if (!range || !healthcareService || combos.length === 0) {
      setSlots(undefined);
      return () => {};
    }

    setLoading(true);

    Promise.all(
      combos.map(async (combo) => {
        const url = medplum.fhirUrl('Appointment', '$find');
        url.searchParams.append('start', range.start.toISOString());
        url.searchParams.append('end', range.end.toISOString());
        url.searchParams.append('service-type-reference', getReferenceString(healthcareService));
        combo.schedules.forEach((schedule) => {
          url.searchParams.append('schedule', getReferenceString(schedule));
        });

        const bundle = await medplum.get<Bundle<Appointment>>(url);
        const appointments = (bundle?.entry?.map((e) => e.resource).filter(isDefined) ?? []) as WithId<Appointment>[];
        return appointments.map((appointment) => ({ appointment, combo }) satisfies ComboSlot);
      })
    )
      .then((results) => {
        if (!running) {
          return;
        }
        // Dedupe combos that propose the exact same appointment (can happen
        // when two schedules resolve to overlapping actor sets); otherwise
        // keep one row per distinct combo even when start times repeat.
        const seen = new Set<string>();
        const merged = results
          .flat()
          .filter((slot) => {
            const key = `${slot.combo.key}|${slot.appointment.start}`;
            if (seen.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          })
          .sort((a, b) => (a.appointment.start ?? '').localeCompare(b.appointment.start ?? ''));
        setSlots(merged);
      })
      .catch((err) => {
        if (running) {
          showErrorNotification(err);
          setSlots([]);
        }
      })
      .finally(() => {
        if (running) {
          setLoading(false);
        }
      });

    return () => {
      running = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medplum, comboKey, healthcareService, range?.start.getTime(), range?.end.getTime()]);

  return { slots, loading };
}
