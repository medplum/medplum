// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, isError, normalizeErrorString } from '@medplum/core';
import type { HealthcareService, Location, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import {
  filterCandidatesByLocation,
  groupCandidatesByRole,
  searchEligibleSchedules,
} from './AppointmentFinder.schedules';

export interface UseEligibleSchedulesResult {
  readonly candidates: readonly ScheduleCandidate[];
  /** One group per role the service is booked against, in a stable order. */
  readonly groups: readonly ScheduleCandidateGroup[];
  /** How many schedules the location ruled out. */
  readonly excludedByLocation: number;
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
 * @param location - The site being booked at. Actors sited elsewhere are left
 *   out.
 * @returns The candidate schedules and their groups, plus load and error state.
 */
export function useEligibleSchedules(
  service: Reference<HealthcareService> | WithId<HealthcareService> | undefined,
  location?: Reference<Location> | WithId<Location>
): UseEligibleSchedulesResult {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState<EligibleState>(NOTHING_LOADED);
  const [serviceOutcome, setServiceOutcome] = useState<OperationOutcome>();

  const resolvedService = useResource<HealthcareService>(service, setServiceOutcome);
  const serviceError = useMemo(
    () => (serviceOutcome && !resolvedService ? new Error(normalizeErrorString(serviceOutcome)) : undefined),
    [serviceOutcome, resolvedService]
  );

  const locationReference = location && getReferenceString(location);
  const asked = resolvedService ? `${getReferenceString(resolvedService)}|${locationReference ?? ''}` : '';
  const stale = loaded.key !== asked;

  useEffect(() => {
    if (!resolvedService) {
      return undefined;
    }

    const controller = new AbortController();

    searchEligibleSchedules(medplum, resolvedService, { signal: controller.signal })
      .then(async (found) => {
        const kept = await filterCandidatesByLocation(
          medplum,
          found,
          locationReference ? { reference: locationReference } : undefined,
          { signal: controller.signal }
        );
        return { kept, excluded: found.length - kept.length };
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setLoaded({ key: asked, candidates: result.kept, excludedByLocation: result.excluded, error: undefined });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({
            key: asked,
            candidates: [],
            excludedByLocation: 0,
            error: isError(reason) ? reason : new Error(normalizeErrorString(reason), { cause: reason }),
          });
        }
      });

    return () => controller.abort();
  }, [medplum, resolvedService, locationReference, asked]);

  const candidates = stale ? NOTHING_LOADED.candidates : loaded.candidates;
  const groups = useMemo(() => groupCandidatesByRole(candidates), [candidates]);

  return {
    candidates,
    groups,
    excludedByLocation: stale ? 0 : loaded.excludedByLocation,
    loading: (!!service && !resolvedService && !serviceError) || (!!resolvedService && stale),
    error: serviceError ?? (stale ? undefined : loaded.error),
  };
}

/** What one load found, stamped with the question it answers. */
interface EligibleState {
  readonly key: string;
  readonly candidates: readonly ScheduleCandidate[];
  readonly excludedByLocation: number;
  readonly error: Error | undefined;
}

const NOTHING_LOADED: EligibleState = { key: '', candidates: [], excludedByLocation: 0, error: undefined };
