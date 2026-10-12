// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';
import type { OfferAllSwitchProps } from './OfferAllSwitch';
import type { OfferingFields, ScheduleFields } from './scheduleDraft';
import { hasOverrides, isCovered, storedOfferingFields } from './scheduleDraft';

export interface UseOfferAllOptions {
  /** Every visit type loaded. */
  readonly services: readonly WithId<HealthcareService>[];
  /** The Schedule as stored, if the actor has one. */
  readonly schedule: Schedule | undefined;
  readonly fields: ScheduleFields;
  readonly setFields: Dispatch<SetStateAction<ScheduleFields>>;
  /** Sets the open entry's visit type id, closed when switching off stops offering it. */
  readonly setOpenServiceId: Dispatch<SetStateAction<string | null>>;
}

export interface UseOfferAllResult {
  /** Spread onto `OfferAllSwitch`, beside the actor's name. */
  readonly switchProps: Omit<OfferAllSwitchProps, 'actorName'>;
  /** Forgets what was offered before switching on, for Discard. */
  readonly reset: () => void;
}

/**
 * Switches an actor's page between offering every active visit type and offering the ones it names.
 *
 * Switching on lists every active visit type, seeded from what the Schedule holds for each. Switching off keeps
 * the ones customized here, and those offered before it was switched on, when that happened since the page
 * opened.
 * @param options - The visit types, the stored Schedule, and the page's fields with how to change them.
 * @returns The switch's props, and how to reset it.
 */
export function useOfferAll(options: UseOfferAllOptions): UseOfferAllResult {
  const { services, schedule, fields, setFields, setOpenServiceId } = options;
  const [offeredBeforeAll, setOfferedBeforeAll] = useState<ReadonlySet<string>>();

  function keepsOffering(id: string, value: OfferingFields): boolean {
    return hasOverrides(value) || !!offeredBeforeAll?.has(id);
  }

  function offerAll(): void {
    setOfferedBeforeAll(new Set(Object.keys(fields.offerings)));
    // Seeded from what the Schedule holds for each, which offering all of them puts in effect.
    const covered = services
      .filter((service) => isCovered(service) && !Object.hasOwn(fields.offerings, service.id))
      .map((service) => [service.id, storedOfferingFields(service, schedule)]);
    setFields((current) => ({
      ...current,
      allServices: true,
      offerings: { ...Object.fromEntries(covered), ...current.offerings },
    }));
  }

  function stopOfferingAll(): void {
    const offerings = Object.fromEntries(
      Object.entries(fields.offerings).filter(([id, value]) => keepsOffering(id, value))
    );
    setFields((current) => ({ ...current, allServices: false, offerings }));
    setOpenServiceId((current) => (current && Object.hasOwn(offerings, current) ? current : null));
    setOfferedBeforeAll(undefined);
  }

  const coverable = services.filter(isCovered);
  const offeredCount = Object.keys(fields.offerings).length;
  const keptCount = Object.entries(fields.offerings).filter(([id, value]) => keepsOffering(id, value)).length;

  return {
    switchProps: {
      checked: fields.allServices,
      coverage: {
        total: coverable.length,
        withoutHours: coverable.filter(
          (service) => !service.availableTime?.length && !fields.offerings[service.id]?.availability.overriding
        ).length,
      },
      keeping: { kept: keptCount, dropped: offeredCount - keptCount, restoresEarlier: !!offeredBeforeAll },
      onChange: (checked) => (checked ? offerAll() : stopOfferingAll()),
    },
    reset: () => setOfferedBeforeAll(undefined),
  };
}
