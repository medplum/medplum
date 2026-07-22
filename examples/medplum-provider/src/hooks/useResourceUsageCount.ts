// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { useSearchResources } from '@medplum/react-hooks';
import { useMemo } from 'react';
import { extractReferencesFromCodeableReferenceLike } from '../utils/servicetype';

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Deactivate-with-usage-count check (Configuration spec §6, §10) — before a
 * deactivate action is confirmed, the operator sees how many upcoming
 * appointments still reference the resource, so it's an informed action
 * rather than a silent landmine. Demo-grade: fetches upcoming booked/pending
 * appointments (capped) and filters client-side, matching this app's scale
 * (~180 appointments) rather than relying on a server-side aggregate.
 *
 * Pass `actorRef` for a provider/room/device (counts appointments where it's
 * a participant); pass `visitType` for a HealthcareService (counts
 * appointments whose `serviceType` references it).
 * @param filter - Filter options.
 * @param filter.actorRef - A Practitioner/Location/Device reference string; counts appointments where it's a participant.
 * @param filter.visitType - A HealthcareService; counts appointments whose `serviceType` references it. Ignored if `actorRef` is set.
 * @returns The upcoming-usage count and whether it's still loading.
 */
export function useResourceUsageCount(filter: {
  actorRef?: string;
  visitType?: WithId<HealthcareService>;
}): { count: number; loading: boolean } {
  const baseCriteria = { status: 'booked,pending', date: `ge${todayInputValue()}`, _count: 200 };
  let searchCriteria: (typeof baseCriteria & { actor?: string }) | undefined;
  if (filter.actorRef) {
    searchCriteria = { ...baseCriteria, actor: filter.actorRef };
  } else if (filter.visitType) {
    searchCriteria = baseCriteria;
  }

  const [appointments, loading] = useSearchResources('Appointment', searchCriteria, {
    enabled: !!searchCriteria,
  });

  const count = useMemo(() => {
    if (!appointments) {
      return 0;
    }
    if (filter.visitType) {
      const visitTypeRef = getReferenceString(filter.visitType);
      return appointments.filter((a) =>
        extractReferencesFromCodeableReferenceLike(a.serviceType).some((ref) => ref.reference === visitTypeRef)
      ).length;
    }
    return appointments.length;
  }, [appointments, filter.visitType]);

  return { count, loading };
}
