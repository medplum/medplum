// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { extractServiceTypeReferences, getScheduleTimezones, getSchedulingTimezone } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';

const EMPTY_SERVICES: Readonly<Record<string, WithId<HealthcareService>>> = {};

/**
 * Resolves the timezone each calendar is scheduled in.
 *
 * A calendar's timezone is settled by its visit type as much as by itself — the Schedule may
 * override it, but the HealthcareService is where most projects put it, and `getSchedulingTimezone`
 * can only apply that precedence when handed the service. So the services the calendars are
 * bookable for are loaded, in one search, and each calendar is resolved through them the way the
 * server would. A calendar with no service to ask falls back to what the Schedule and its actor say
 * outright, which is all that can be known without one.
 *
 * @param candidates - The calendars on show.
 * @returns The distinct timezones found for each, keyed by Schedule id.
 */
export function useScheduleTimezones(candidates: readonly ScheduleCandidate[]): ReadonlyMap<string, string[]> {
  const medplum = useMedplum();
  const [services, setServices] = useState<Readonly<Record<string, WithId<HealthcareService>>>>(EMPTY_SERVICES);

  const serviceIdsKey = useMemo(() => {
    const ids = candidates.flatMap((candidate) =>
      extractServiceTypeReferences(candidate.schedule.serviceType)
        .map((reference) => reference.reference?.split('/')[1])
        .filter((id): id is string => !!id)
    );
    return [...new Set(ids)].sort().join(',');
  }, [candidates]);

  useEffect(() => {
    if (serviceIdsKey.length === 0) {
      return () => {};
    }
    const controller = new AbortController();
    medplum
      .searchResources('HealthcareService', { _id: serviceIdsKey, _count: '100' }, { signal: controller.signal })
      .then((found) => {
        if (!controller.signal.aborted) {
          setServices(Object.fromEntries(found.map((service) => [service.id, service])));
        }
      })
      // Swallow errors here because failure to load services is not fatal to the workspace
      .catch(() => {
        if (!controller.signal.aborted) {
          setServices(EMPTY_SERVICES);
        }
      });
    return () => controller.abort();
  }, [medplum, serviceIdsKey]);

  return useMemo(() => {
    const byScheduleId = new Map<string, string[]>();
    for (const candidate of candidates) {
      const timezones = extractServiceTypeReferences(candidate.schedule.serviceType)
        .map((reference) => services[reference.reference?.split('/')[1] ?? ''])
        .filter((service) => !!service)
        .map((service) => getSchedulingTimezone(service, candidate.schedule, candidate.actorResource))
        .filter((timezone): timezone is string => !!timezone);

      const resolved =
        timezones.length > 0 ? timezones : getScheduleTimezones(candidate.schedule, candidate.actorResource);
      if (resolved.length > 0) {
        byScheduleId.set(candidate.schedule.id, [...new Set(resolved)]);
      }
    }
    return byScheduleId;
  }, [candidates, services]);
}
