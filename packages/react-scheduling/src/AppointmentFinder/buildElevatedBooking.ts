// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import {
  createReference,
  generateId,
  SchedulingSlotCapacityURI,
  SchedulingUnvalidatedBookingURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { Appointment, Bundle, HealthcareService, Schedule, Slot } from '@medplum/fhirtypes';
import { resolveBookingGeometry } from '../bookingGeometry';

export interface ElevatedBookingOptions {
  /** The visit type being booked. */
  readonly service: WithId<HealthcareService>;
  /** Every schedule the visit is held on. Each reserves its own Slots. */
  readonly schedules: readonly WithId<Schedule>[];
  /** When the visit starts. */
  readonly start: Date;
  /** How long it runs, in minutes. */
  readonly durationMinutes: number;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Assembles a proposal for a time nobody checked availability for.
 *
 * Buffers and capacity come from configuration, not the caller: placing a visit by
 * hand overrides *when* it is held, not how the practice spaces or stacks its visits.
 *
 * Applies no rules. The time may be occupied, blocked, outside the schedule's hours,
 * off the configured start interval, or any length at all.
 *
 * @param options - The visit type, its schedules, and when and how long it runs.
 * @returns The proposal, with its Slots contained, ready to be written.
 */
export function buildElevatedBooking(options: ElevatedBookingOptions): Appointment {
  const { service, schedules, start: startDate, durationMinutes } = options;

  // The calendar hides a booking's Slot behind its Appointment by comparing these as
  // strings, so two roundings of one instant draw a "Blocked" block over the visit.
  const start = startDate.toISOString();
  const end = addMinutes(startDate, durationMinutes).toISOString();

  const contained = schedules.flatMap((schedule): Slot[] => {
    const { bufferBefore, bufferAfter, slotCapacity } = resolveBookingGeometry(service, schedule);
    const scheduleReference = createReference(schedule);

    const busy: Slot = { resourceType: 'Slot', start, end, schedule: scheduleReference, status: 'busy' };
    // An unstamped Slot reads as capacity 1, which is what the server stamps too.
    if (slotCapacity > 1) {
      busy.extension = [{ url: SchedulingSlotCapacityURI, valuePositiveInt: slotCapacity }];
    }

    const slots: Slot[] = [busy];

    if (bufferBefore) {
      slots.push({
        resourceType: 'Slot',
        start: addMinutes(startDate, -bufferBefore).toISOString(),
        end: start,
        schedule: scheduleReference,
        status: 'busy-unavailable',
        comment: 'buffer before appointment',
      });
    }

    if (bufferAfter) {
      slots.push({
        resourceType: 'Slot',
        start: end,
        end: addMinutes(startDate, durationMinutes + bufferAfter).toISOString(),
        schedule: scheduleReference,
        status: 'busy-unavailable',
        comment: 'buffer after appointment',
      });
    }

    return slots;
  });

  return {
    resourceType: 'Appointment',
    start,
    end,
    status: 'proposed',
    serviceType: toServiceTypeCodeableConcepts(service),
    participant: schedules.flatMap((schedule) =>
      schedule.actor.map((actor) => ({ actor, required: 'required', status: 'needs-action' }) as const)
    ),
    contained,
  };
}

/**
 * Writes a proposal that no rule was checked against.
 *
 * Sent as a transaction, so the appointment and its Slots commit together on projects with
 * the `transaction-bundles` feature enabled. Without it they are applied as a plain batch,
 * where an appointment that failed to write would leave Slots holding no visit.
 * @see https://www.medplum.com/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions
 * @param medplum - The client to write through.
 * @param proposal - The proposal to write, with its Slots contained.
 * @returns The bundle the server answered with.
 */
export async function writeElevatedBooking(
  medplum: MedplumClient,
  proposal: Appointment
): Promise<Bundle<WithId<Appointment> | WithId<Slot>>> {
  const { contained, ...rest } = proposal;
  const slots = (contained ?? []).filter((resource): resource is Slot => resource.resourceType === 'Slot');
  const slotUrls = slots.map(() => `urn:uuid:${generateId()}`);

  const appointment: Appointment = {
    ...rest,
    // `$find` proposals say `proposed`, and only `$book` flips that; this path must do it itself.
    status: 'booked',
    slot: slotUrls.map((reference) => ({ reference })),
    extension: [...(rest.extension ?? []), { url: SchedulingUnvalidatedBookingURI, valueBoolean: true }],
  };

  return medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      ...slots.map((slot, index) => ({
        fullUrl: slotUrls[index],
        resource: slot,
        request: { method: 'POST', url: 'Slot' } as const,
      })),
      { resource: appointment, request: { method: 'POST', url: 'Appointment' } as const },
    ],
  }) as Promise<Bundle<WithId<Appointment> | WithId<Slot>>>;
}
