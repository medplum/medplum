// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMantineTheme } from '@mantine/core';
import { extractServiceTypeReferences, getReferenceString, isDefined } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { useMemo } from 'react';
import { getActorType } from '../actors';
import type { ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';
import { getCandidateActor } from '../AppointmentFinder/AppointmentFinder.schedules';
import type { AvailabilityShade } from '../availabilityShading';
import { computeAvailabilityShading } from '../availabilityShading';
import { fallbackColorIndex, getSchedulingColor, resolveThemeColor } from '../colors';
import type { DateTimeRange } from '../types';
import type { CalendarFilterValues } from './CalendarFilters';
import { useHealthcareServices } from './useHealthcareServices';

const NO_PROVIDERS: readonly ScheduleCandidate[] = [];
const NO_REFERENCES: readonly string[] = [];

export interface UseAvailabilityShadingOptions {
  /** Whether to draw availability at all. Nothing is read or worked out while false. */
  readonly enabled: boolean;
  /** The calendars on show. Availability is drawn for the providers among them. */
  readonly candidates: readonly ScheduleCandidate[];
  /** Every appointment loaded for the calendars on show, including the ones the filters hide. */
  readonly appointments: readonly Appointment[] | undefined;
  readonly slots: readonly Slot[] | undefined;
  readonly filters: CalendarFilterValues;
  /** The days on show. */
  readonly range: DateTimeRange | undefined;
}

export interface WorkspaceAvailabilityShading {
  /** The blocks to hand the calendar. */
  readonly shades: readonly AvailabilityShade[] | undefined;
  /** How to bring the colors back, while several providers and no visit type leave them off. */
  readonly hint: string | undefined;
}

/**
 * Works out the availability blocks the workspace's calendar draws behind its events: one visit type's,
 * across the providers on show, or one provider's, across the visit types its Schedule names.
 * @param options - The calendars on show, what takes their time, the filters and the days on show.
 * @returns The blocks, and a hint for when there are none to draw.
 */
export function useAvailabilityShading(options: UseAvailabilityShadingOptions): WorkspaceAvailabilityShading {
  const { enabled, candidates, appointments, slots, filters, range } = options;
  const theme = useMantineTheme();

  const providers = useMemo(
    () =>
      enabled
        ? candidates.filter((candidate) => getActorType(getCandidateActor(candidate)) === 'Practitioner')
        : NO_PROVIDERS,
    [enabled, candidates]
  );

  const lone = !filters.service && providers.length === 1 ? providers[0].schedule : undefined;
  const references = useMemo(
    () => (lone ? extractServiceTypeReferences(lone.serviceType).map((service) => service.reference) : NO_REFERENCES),
    [lone]
  );
  const services = useHealthcareServices(references);

  const shading = useMemo(() => {
    if (!enabled || !range) {
      return undefined;
    }
    return computeAvailabilityShading({
      calendars: providers.map(({ schedule }) => {
        const actors = new Set(schedule.actor.map((actor) => actor.reference).filter(isDefined));
        const scheduleReference = getReferenceString(schedule);
        return {
          schedule,
          appointments: (appointments ?? []).filter((appointment) =>
            appointment.participant.some(({ actor }) => actor?.reference && actors.has(actor.reference))
          ),
          slots: (slots ?? []).filter((slot) => slot.schedule.reference === scheduleReference),
        };
      }),
      services: references.map((reference) => services.get(reference)).filter(isDefined),
      filters,
      range,
      colorOf: (service) =>
        resolveThemeColor(theme, getSchedulingColor(service), fallbackColorIndex(getReferenceString(service))),
    });
  }, [enabled, range, providers, appointments, slots, references, services, filters, theme]);

  return {
    shades: shading?.shades,
    hint:
      shading?.mode === 'off' && providers.length > 1
        ? 'Select a visit type or show a single provider to see availability colors.'
        : undefined,
  };
}
