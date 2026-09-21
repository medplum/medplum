// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HealthcareServiceSchedulingParameterUrl, WithId } from '@medplum/core';
import {
  getHealthcareServiceSchedulingParameters,
  getScheduleSchedulingParameters,
  schedulingDurationToMinutes,
} from '@medplum/core';
import type { Extension, HealthcareService, Schedule } from '@medplum/fhirtypes';

/**
 * Defaults matching the server's own, applied when neither the Schedule nor the
 * HealthcareService sets the parameter.
 *
 * A second copy of the server's `SERVICE_DEFAULTS` with nothing holding the two
 * together. Bookings shaped from these are written directly, so drift is not caught
 * by validation.
 *
 * `duration` has no default: the server refuses a booking without one, so an absent
 * duration is missing configuration rather than a value to guess at.
 */
const BOOKING_GEOMETRY_DEFAULTS = { bufferBefore: 0, bufferAfter: 0, slotCapacity: 1 } as const;

/** The scheduling parameters that decide the shape of a booking's Slots. */
export interface BookingGeometry {
  /** Configured visit length in minutes, or undefined when neither layer sets one. */
  readonly duration: number | undefined;
  /** Minutes held before the visit, as a `busy-unavailable` Slot. */
  readonly bufferBefore: number;
  /** Minutes held after the visit, as a `busy-unavailable` Slot. */
  readonly bufferAfter: number;
  /** How many visits may be held concurrently. `1` means no overbooking. */
  readonly slotCapacity: number;
}

/**
 * Reads one SchedulingParameters sub-extension in the server's priority order: what the
 * Schedule sets for the service, then what the service sets for itself.
 * @param service - HealthcareService whose parameters are the fallback layer
 * @param schedule - Schedule whose parameters take precedence, if any
 * @param url - Url of the sub-extension to read, for example `bufferBefore`
 * @returns The winning sub-extension, if either layer sets it
 */
function resolveSchedulingParameter(
  service: WithId<HealthcareService>,
  schedule: Schedule | undefined,
  url: HealthcareServiceSchedulingParameterUrl
): Extension | undefined {
  const fromSchedule = schedule ? getScheduleSchedulingParameters(schedule, service, url)[0] : undefined;
  if (fromSchedule) {
    return fromSchedule;
  }
  return getHealthcareServiceSchedulingParameters(service, url)[0];
}

/**
 * Resolves the parameters that decide what Slots a booking reserves, in the same priority
 * order and with the same defaults the server applies.
 *
 * Availability, alignment and the planning horizon are deliberately left out: they
 * answer *whether* a time may be booked, which is the server's to decide. Read this to
 * draw a booking, never to judge one.
 * @param service - HealthcareService being booked
 * @param schedule - Schedule the visit is held on. Omit to read the service's own defaults.
 * @returns The duration, buffers and capacity that apply.
 */
export function resolveBookingGeometry(service: WithId<HealthcareService>, schedule?: Schedule): BookingGeometry {
  const minutes = (url: HealthcareServiceSchedulingParameterUrl): number | undefined =>
    schedulingDurationToMinutes(resolveSchedulingParameter(service, schedule, url)?.valueDuration);

  const capacity = resolveSchedulingParameter(service, schedule, 'slotCapacity')?.valuePositiveInt;

  return {
    duration: minutes('duration'),
    bufferBefore: minutes('bufferBefore') ?? BOOKING_GEOMETRY_DEFAULTS.bufferBefore,
    bufferAfter: minutes('bufferAfter') ?? BOOKING_GEOMETRY_DEFAULTS.bufferAfter,
    slotCapacity:
      typeof capacity === 'number' && Number.isInteger(capacity) && capacity >= 1
        ? capacity
        : BOOKING_GEOMETRY_DEFAULTS.slotCapacity,
  };
}
