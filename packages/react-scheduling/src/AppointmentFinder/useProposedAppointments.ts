// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString, isDefined, isError, normalizeErrorString } from '@medplum/core';
import type { Appointment, Bundle, HealthcareService, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import type { ActorCombination } from './AppointmentFinder.schedules';
import type { DateRange } from './AppointmentFinder.times';
import { getFindWindowError } from './AppointmentFinder.times';

/** `$find`'s own default page size, applied per combination. */
const DEFAULT_COUNT = 20;

/**
 * Separates the request urls packed into the effect's dependency.
 *
 * A newline cannot survive `URL.toString()`, so no url can contain one.
 */
const URL_SEPARATOR = '\n';

export interface UseProposedAppointmentsOptions {
  /** The service being booked, as a reference or the resource itself. */
  readonly service: Reference<HealthcareService> | WithId<HealthcareService> | undefined;
  /** The sets of actors to search for, from `getActorCombinations`. */
  readonly combinations: readonly ActorCombination[];
  /** The days to search. Both ends are needed; `$find` refuses an open range. */
  readonly range: DateRange;
  /** Times to ask for per combination. Defaults to 20. */
  readonly count?: number;
}

export interface UseProposedAppointmentsResult {
  /**
   * Every time offered, never persisted — `$find` proposes.
   */
  readonly appointments: readonly Appointment[];
  /** How many `$find` requests the current combinations take. */
  readonly requestCount: number;
  readonly loading: boolean;
  /** Set only when every combination failed. */
  readonly error: Error | undefined;
}

/**
 * Searches for the times an appointment could be held at.
 * @param options - The service, actor combinations, days, and page size.
 * @returns The times offered, plus load and error state.
 */
export function useProposedAppointments(options: UseProposedAppointmentsOptions): UseProposedAppointmentsResult {
  const { service, combinations, range, count = DEFAULT_COUNT } = options;
  const medplum = useMedplum();
  const [answered, setAnswered] = useState<SearchState>(NOTHING_ASKED);

  const { start, end } = range;
  const serviceReference = service && getReferenceString(service);
  const urls =
    serviceReference && start && end && !getFindWindowError(range)
      ? combinations.map((combination) => buildFindUrl(medplum, serviceReference, combination, start, end, count))
      : [];
  const urlsKey = urls.join(URL_SEPARATOR);

  const stale = answered.key !== urlsKey;

  useEffect(() => {
    if (!urlsKey) {
      return undefined;
    }

    const controller = new AbortController();
    const requests = urlsKey.split(URL_SEPARATOR);

    Promise.allSettled(
      requests.map(async (url) => medplum.get<Bundle<Appointment>>(url, { signal: controller.signal }))
    )
      .then((results) => {
        if (controller.signal.aborted) {
          return;
        }
        const failure = results.find((result) => result.status === 'rejected');
        setAnswered(
          failure && results.every((result) => result.status === 'rejected')
            ? { key: urlsKey, appointments: [], error: toError(failure.reason) }
            : { key: urlsKey, appointments: collectAppointments(results), error: undefined }
        );
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setAnswered({ key: urlsKey, appointments: [], error: toError(reason) });
        }
      });

    return () => controller.abort();
  }, [medplum, urlsKey]);

  return {
    // Times already found stay on screen while a narrower search runs, but a
    // search with nobody to search for has none to show.
    appointments: urls.length === 0 ? NOTHING_ASKED.appointments : answered.appointments,
    requestCount: urls.length,
    loading: urls.length > 0 && stale,
    error: stale ? undefined : answered.error,
  };
}

/** What one search returned, stamped with the urls it answers. */
interface SearchState {
  readonly key: string;
  readonly appointments: readonly Appointment[];
  readonly error: Error | undefined;
}

const NOTHING_ASKED: SearchState = { key: '', appointments: [], error: undefined };

function toError(reason: unknown): Error {
  return isError(reason) ? reason : new Error(normalizeErrorString(reason), { cause: reason });
}

function buildFindUrl(
  medplum: MedplumClient,
  serviceReference: string,
  combination: ActorCombination,
  start: Date,
  end: Date,
  count: number
): string {
  const url = medplum.fhirUrl('Appointment', '$find');
  url.searchParams.set('start', start.toISOString());
  url.searchParams.set('end', end.toISOString());
  url.searchParams.set('service-type-reference', serviceReference);
  for (const schedule of combination.schedules) {
    if (schedule.reference) {
      url.searchParams.append('schedule', schedule.reference);
    }
  }
  url.searchParams.set('_count', count.toString());
  return url.toString();
}

/**
 * Unions what the combinations found, in the order they were asked.
 * @param results - What each combination returned.
 * @returns The times offered, each combination's own ascending.
 */
function collectAppointments(results: readonly PromiseSettledResult<Bundle<Appointment>>[]): Appointment[] {
  return results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => (result.value.entry ?? []).map((entry) => entry.resource).filter(isDefined));
}
