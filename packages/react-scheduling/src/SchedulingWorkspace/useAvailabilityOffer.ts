// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  getHealthcareServiceSchedulingParameters,
  schedulingDurationToMinutes,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { Appointment, HealthcareService } from '@medplum/fhirtypes';
import { useCallback, useMemo, useState } from 'react';
import type { ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';
import { createActorRequirement } from '../AppointmentFinder/AppointmentFinder.schedules';
import type { AppointmentTimePick } from '../AppointmentFinder/AppointmentProposalForm';
import type { AvailabilityOffer, AvailabilityShade } from '../availabilityShading';
import { getAvailabilityOffer } from '../availabilityShading';
import { resolveBookingGeometry } from '../bookingGeometry';
import { useChanged } from '../hooks/useChanged';

export interface UseAvailabilityOfferOptions {
  /** False while a click on the calendar is not for booking a visit, such as while blocking time. */
  readonly enabled: boolean;
  /** The availability blocks on show. */
  readonly shades: readonly AvailabilityShade[] | undefined;
  /** The chosen visit type. Nothing is offered without one. */
  readonly service: WithId<HealthcareService> | undefined;
  /** The calendars on show, which the ones open for an offered time are named from. */
  readonly candidates: readonly ScheduleCandidate[];
}

export interface WorkspaceAvailabilityOffer {
  /** The visit under the pointer, as a proposed appointment for the calendar to draw. */
  readonly proposed: Appointment | undefined;
  /** What a click on the visit under the pointer hands the booking form. */
  readonly pick: AppointmentTimePick | undefined;
  /** For the calendar's `onHoverAvailability`. */
  readonly onHover: (instant: Date | undefined) => void;
}

/**
 * Follows the pointer over a visit type's availability blocks, offering the visit it is on: the chosen
 * visit type, at its own length and start times, with the providers on show who are open for it.
 * @param options - The blocks, the visit type and the calendars on show.
 * @returns The visit under the pointer, to draw and to book from, and the handler that keeps it current.
 */
export function useAvailabilityOffer(options: UseAvailabilityOfferOptions): WorkspaceAvailabilityOffer {
  const { enabled, shades, service, candidates } = options;
  const [held, setHeld] = useState<AvailabilityOffer>();

  const geometry = useMemo(() => {
    const durationMinutes = service && resolveBookingGeometry(service).duration;
    if (!service || !durationMinutes) {
      return undefined;
    }
    const alignment = getHealthcareServiceSchedulingParameters(service, 'alignmentInterval')[0]?.valueDuration;
    return { durationMinutes, alignmentMinutes: schedulingDurationToMinutes(alignment) };
  }, [service]);

  // The pointer need not move for the blocks under it to change, as they do when a filter does.
  if (useChanged(shades) && held) {
    setHeld(undefined);
  }
  const offer = enabled ? held : undefined;

  // Kept while the pointer moves within one visit, so that redraws nothing.
  const onHover = useCallback(
    (instant: Date | undefined): void => {
      const next =
        instant && shades && geometry
          ? getAvailabilityOffer(shades, instant, { ...geometry, from: new Date() })
          : undefined;
      setHeld((previous) => (isSameOffer(previous, next) ? previous : next));
    },
    [shades, geometry]
  );

  const offered = useMemo(() => {
    if (!offer || !service) {
      return undefined;
    }
    const open = candidates.filter((candidate) => offer.schedules.some((s) => s.id === candidate.schedule.id));
    const proposed: Appointment = {
      resourceType: 'Appointment',
      status: 'proposed',
      start: offer.start.toISOString(),
      end: offer.end.toISOString(),
      serviceType: toServiceTypeCodeableConcepts(service),
      participant: open.map((candidate) => ({ actor: candidate.schedule.actor[0], status: 'needs-action' })),
    };
    const pick: AppointmentTimePick = {
      start: offer.start,
      service,
      selections: { Practitioner: [createActorRequirement(open)] },
    };
    return { proposed, pick };
  }, [offer, service, candidates]);

  return { proposed: offered?.proposed, pick: offered?.pick, onHover };
}

function isSameOffer(a: AvailabilityOffer | undefined, b: AvailabilityOffer | undefined): boolean {
  if (!a || !b) {
    return a === b;
  }
  return (
    a.start.getTime() === b.start.getTime() &&
    a.schedules.length === b.schedules.length &&
    a.schedules.every((schedule, index) => schedule.id === b.schedules[index].id)
  );
}
