// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.utils';
import { filterCandidatesByClinic, groupCandidatesByRole, searchEligibleSchedules } from './AppointmentFinder.utils';

export interface UseEligibleSchedulesResult {
  readonly candidates: readonly ScheduleCandidate[];
  /** One group per role the service is booked against, in a stable order. */
  readonly groups: readonly ScheduleCandidateGroup[];
  /**
   * How many schedules the clinic ruled out. It tells an empty result apart: a
   * service with nothing configured is a different problem from one whose actors
   * are all at other sites.
   */
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
  const [candidates, setCandidates] = useState<readonly ScheduleCandidate[]>([]);
  const [excludedByClinic, setExcludedByClinic] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const clinicReference = clinic && getReferenceString(clinic);

  useEffect(() => {
    if (!service) {
      setCandidates([]);
      setExcludedByClinic(0);
      setError(undefined);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(undefined);

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
          setCandidates(result.kept);
          setExcludedByClinic(result.excluded);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setCandidates([]);
          setExcludedByClinic(0);
          setError(new Error(normalizeErrorString(reason), { cause: reason }));
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [medplum, service, clinicReference]);

  const groups = useMemo(() => groupCandidatesByRole(candidates), [candidates]);

  return { candidates, groups, excludedByClinic, loading, error };
}
