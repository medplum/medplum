// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, MedplumClient } from '@medplum/core';
import { Appointment, Bundle, BundleEntry, Reference, Schedule, Slot } from '@medplum/fhirtypes';

export interface BlockAvailabilityEvent {
  schedule: Reference<Schedule>;
  start: string;
  end: string;
}

export async function handler(medplum: MedplumClient, event: BotEvent<BlockAvailabilityEvent>): Promise<Bundle> {
  const { schedule, start, end } = event.input;

  // Basic data validation
  if (new Date(end) < new Date(start)) {
    throw new Error('End date must be after start date');
  }

  const entries: BundleEntry[] = [];

  // Create a Slot with status 'busy-unavailable' for the period
  const blockedSlot: Slot = {
    resourceType: 'Slot',
    schedule: schedule,
    start: start,
    end: end,
    status: 'busy-unavailable',
  };
  entries.push({
    request: {
      method: 'POST',
      url: 'Slot',
    },
    resource: blockedSlot,
  });

  // Cancel booked appointments that overlap the period
  const appointmentsToCancel: Appointment[] = await medplum.searchResources(
    'Appointment',
    `date=lt${end}&date=ge${start}&status=booked`
  );
  entries.push(
    ...appointmentsToCancel.map(
      (appointment): BundleEntry => ({
        request: {
          method: 'PUT',
          url: `Appointment?_id=${appointment.id}`,
        },
        resource: {
          ...appointment,
          status: 'cancelled',
          cancelationReason: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason',
                code: 'prov',
                display: 'Provider',
              },
            ],
          },
        },
      })
    )
  );

  // Block free slots that overlap the period
  const freeSlotsToBlock: Slot[] = await medplum.searchResources(
    'Slot',
    `schedule=${schedule.reference}&start=lt${end}&start=ge${start}&status=free`
  );
  entries.push(
    ...freeSlotsToBlock.map(
      (slot): BundleEntry => ({
        request: {
          method: 'PUT',
          url: `Slot?_id=${slot.id}`,
        },
        resource: {
          ...slot,
          status: 'busy-unavailable',
        },
      })
    )
  );

  // Execute the batch to create/update all resources at once
  const responseBundle = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries,
  });
  return responseBundle;
}
