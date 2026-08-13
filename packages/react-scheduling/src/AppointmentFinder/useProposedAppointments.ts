// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString, isDefined, isError, normalizeErrorString } from '@medplum/core';
import type { Appointment, Bundle, HealthcareService } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import type { ActorCombination } from './AppointmentFinder.schedules';
import type { DateRange } from './AppointmentFinder.times';
import { getAppointmentKey } from './AppointmentFinder.times';

/** `$find`'s own default page size, applied per combination. */
const DEFAULT_COUNT = 20;

/**
 * Separates the request urls packed into the effect's dependency.
 *
 * A newline cannot survive `URL.toString()`, so no url can contain one.
 */
const URL_SEPARATOR = '\n';

export interface UseProposedAppointmentsOptions {
  readonly service: WithId<HealthcareService> | undefined;
  /** The sets of actors to search for, from `getActorCombinations`. */
  readonly combinations: readonly ActorCombination[];
  /** The days to search. Both ends are needed; `$find` refuses an open range. */
  readonly range: DateRange;
  /** Times to ask for per combination. Defaults to 20. */
  readonly count?: number;
}

export interface UseProposedAppointmentsResult {
  /** Every time offered, by ascending start. Never persisted — `$find` proposes. */
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
  const urls =
    service && start && end
      ? combinations.map((combination) => buildFindUrl(medplum, service, combination, start, end, count))
      : [];
  const urlsKey = urls.join(URL_SEPARATOR);

  const stale = answered.key !== urlsKey;

  useEffect(() => {
    if (!urlsKey) {
      return undefined;
    }

    const controller = new AbortController();
    const requests = urlsKey.split(URL_SEPARATOR);

    Promise.all(requests.map(async (url) => request(medplum, url, controller.signal)))
      .then((results) => {
        if (controller.signal.aborted) {
          return;
        }
        const failure = results.find(isFailure);
        setAnswered(
          failure && results.every(isFailure)
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
  // Passed through when it already is one: rewrapping would flatten an
  // `OperationOutcomeError` and lose its `outcome`.
  return isError(reason) ? reason : new Error(normalizeErrorString(reason), { cause: reason });
}

/** One combination's result: its times, or why it has none. */
type FindResult = FindSuccess | FindFailure;
interface FindSuccess {
  readonly bundle: Bundle<Appointment>;
}
interface FindFailure {
  readonly reason: unknown;
}

function isFailure(result: FindResult): result is FindFailure {
  return 'reason' in result;
}

async function request(medplum: MedplumClient, url: string, signal: AbortSignal): Promise<FindResult> {
  try {
    return { bundle: await medplum.get<Bundle<Appointment>>(url, { signal }) };
  } catch (reason) {
    return { reason };
  }
}

function buildFindUrl(
  medplum: MedplumClient,
  service: WithId<HealthcareService>,
  combination: ActorCombination,
  start: Date,
  end: Date,
  count: number
): string {
  const url = medplum.fhirUrl('Appointment', '$find');
  url.searchParams.set('start', start.toISOString());
  url.searchParams.set('end', end.toISOString());
  url.searchParams.set('service-type-reference', getReferenceString(service));
  for (const schedule of combination.schedules) {
    if (schedule.reference) {
      url.searchParams.append('schedule', schedule.reference);
    }
  }
  url.searchParams.set('_count', count.toString());
  return url.toString();
}

/**
 * Unions what the combinations found, by ascending start.
 * @param results - What each combination returned.
 * @returns The times offered, deduplicated and sorted.
 */
function collectAppointments(results: readonly FindResult[]): Appointment[] {
  const found = new Map<string, Appointment>();
  for (const result of results) {
    if (isFailure(result)) {
      continue;
    }
    for (const appointment of (result.bundle.entry ?? []).map((entry) => entry.resource).filter(isDefined)) {
      const key = getAppointmentKey(appointment);
      if (!found.has(key)) {
        found.set(key, appointment);
      }
    }
  }
  return [...found.values()].sort((left, right) => (left.start ?? '').localeCompare(right.start ?? ''));
}
