// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import {
  filterCandidatesByClinic,
  groupCandidatesByRole,
  searchEligibleSchedules,
} from './AppointmentFinder.schedules';

export interface UseEligibleSchedulesResult {
  readonly candidates: readonly ScheduleCandidate[];
  /** One group per role the service is booked against, in a stable order. */
  readonly groups: readonly ScheduleCandidateGroup[];
  /** How many schedules the clinic ruled out. */
  readonly excludedByClinic: number;
  readonly loading: boolean;
  readonly error: Error | undefined;
}

/**
 * Loads the Schedules bookable for a HealthcareService, grouped by role.
 *
 * The groups are what a booking form asks about: a service held on providers
 * and rooms produces a provider question and a room question, discovered from
 * the data rather than configured per service.
 *
 * @param service - The service being booked, or undefined to load nothing.
 * @param clinic - The site being booked at. Actors sited elsewhere are left out.
 * @returns The candidate schedules and their groups, plus load and error state.
 */
export function useEligibleSchedules(
  service: WithId<HealthcareService> | undefined,
  clinic?: Reference<Location> | WithId<Location>
): UseEligibleSchedulesResult {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState<EligibleState>(NOTHING_LOADED);

  const clinicReference = clinic && getReferenceString(clinic);
  const asked = service ? `${getReferenceString(service)}|${clinicReference ?? ''}` : '';
  const stale = loaded.key !== asked;

  useEffect(() => {
    if (!service) {
      return undefined;
    }

    const controller = new AbortController();

    searchEligibleSchedules(medplum, service, { signal: controller.signal })
      .then(async (found) => {
        const kept = await filterCandidatesByClinic(
          medplum,
          found,
          clinicReference ? { reference: clinicReference } : undefined,
          { signal: controller.signal }
        );
        return { kept, excluded: found.length - kept.length };
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setLoaded({ key: asked, candidates: result.kept, excludedByClinic: result.excluded, error: undefined });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({
            key: asked,
            candidates: [],
            excludedByClinic: 0,
            error: new Error(normalizeErrorString(reason), { cause: reason }),
          });
        }
      });

    return () => controller.abort();
  }, [medplum, service, clinicReference, asked]);

  // Unlike the times a search offers, these drive the form's own fields. Actors
  // from the service last asked about would be selectable against the one being
  // asked about now, so they are withheld rather than left up while loading.
  const candidates = stale ? NOTHING_LOADED.candidates : loaded.candidates;
  const groups = useMemo(() => groupCandidatesByRole(candidates), [candidates]);

  return {
    candidates,
    groups,
    excludedByClinic: stale ? 0 : loaded.excludedByClinic,
    loading: !!service && stale,
    error: stale ? undefined : loaded.error,
  };
}

/** What one load found, stamped with the question it answers. */
interface EligibleState {
  readonly key: string;
  readonly candidates: readonly ScheduleCandidate[];
  readonly excludedByClinic: number;
  readonly error: Error | undefined;
}

const NOTHING_LOADED: EligibleState = { key: '', candidates: [], excludedByClinic: 0, error: undefined };
