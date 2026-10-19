// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';
import { getOfferedServices, isCoveredByAllServices } from '../SchedulingConfigWorkspace.utils';
import type { OfferAllSwitchProps } from './OfferAllSwitch';
import type { ScheduleFields } from './scheduleDraft';
import { hasOverrides, withCoveredOfferings } from './scheduleDraft';
import { serviceLabel } from './serviceList';

export interface UseOfferAllOptions {
  /** Every visit type loaded. */
  readonly servicesById: ReadonlyMap<string, WithId<HealthcareService>>;
  /** The Schedule as stored, if the actor has one. */
  readonly schedule: Schedule | undefined;
  readonly fields: ScheduleFields;
  readonly setFields: Dispatch<SetStateAction<ScheduleFields>>;
  /** Closes the open entry when switching off stops offering it. */
  readonly setOpenServiceId: Dispatch<SetStateAction<string | null>>;
}

export interface UseOfferAllResult {
  /** Spread onto `OfferAllSwitch` with the actor's name. */
  readonly switchProps: Omit<OfferAllSwitchProps, 'actorName'>;
  /** Puts back the visit types the Schedule names as the ones offered before switching on, for Discard. */
  readonly reset: () => void;
}

/**
 * Switches an actor's page between offering every active visit type and offering the ones it names. Switching off
 * keeps the ones customized here, and the ones named before switching on.
 * @param options - The visit types, the stored Schedule, and the page's fields with how to change them.
 * @returns The switch's props, and how to reset it.
 */
export function useOfferAll(options: UseOfferAllOptions): UseOfferAllResult {
  const { servicesById, schedule, fields, setFields, setOpenServiceId } = options;
  const named = useMemo(
    () => new Set(getOfferedServices(schedule, servicesById).map((service) => service.id)),
    [schedule, servicesById]
  );
  const [offeredBeforeAll, setOfferedBeforeAll] = useState<ReadonlySet<string>>(named);
  const kept = Object.fromEntries(
    Object.entries(fields.offerings).filter(([id, value]) => hasOverrides(value) || offeredBeforeAll.has(id))
  );

  function offerAll(): void {
    setOfferedBeforeAll(new Set(Object.keys(fields.offerings)));
    setFields((current) => ({
      ...current,
      allServices: true,
      offerings: withCoveredOfferings(current.offerings, servicesById.values(), schedule),
    }));
  }

  function stopOfferingAll(): void {
    setFields((current) => ({ ...current, allServices: false, offerings: kept }));
    setOpenServiceId((current) => (current && Object.hasOwn(kept, current) ? current : null));
  }

  const coverable = [...servicesById.values()].filter(isCoveredByAllServices);
  const keptCount = Object.keys(kept).length;
  const offeredCount = Object.keys(fields.offerings).length;

  return {
    switchProps: {
      checked: fields.allServices,
      coverage: {
        total: coverable.length,
        withoutHours: coverable
          .filter((service) => !service.availableTime?.length && !fields.offerings[service.id]?.availability.overriding)
          .map(serviceLabel),
      },
      keeping: { kept: keptCount, dropped: offeredCount - keptCount, restoresEarlier: offeredBeforeAll.size > 0 },
      onChange: (checked) => (checked ? offerAll() : stopOfferingAll()),
    },
    reset: () => setOfferedBeforeAll(named),
  };
}
