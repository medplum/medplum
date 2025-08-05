// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, MedplumClient, resolveId } from '@medplum/core';
import { Appointment, Bundle, BundleEntry, Slot } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Appointment>): Promise<Bundle> {
  const appointment = event.input;

  // Basic data validation
  const slotId = resolveId(appointment.slot?.[0]);
  if (!slotId) {
    throw new Error('Must provide a slot');
  }

  const entries: BundleEntry[] = [];

  // Change the appointment status to 'cancelled'
  appointment.status = 'cancelled';
  appointment.cancelationReason = {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason',
        code: 'prov',
        display: 'Provider',
      },
    ],
  };
  entries.push({
    request: {
      method: 'PUT',
      url: `Appointment?_id=${appointment.id}`,
    },
    resource: appointment,
  });

  // Instead of unlinking the original slot, create a new slot with status 'free'
  // so it can be booked again
  const slot = await medplum.readResource('Slot', slotId);
  const existingFreeSlot = await medplum.searchOne('Slot', {
    start: slot.start,
    status: 'free',
  });
  if (!existingFreeSlot) {
    const newSlot: Slot = { ...slot, id: undefined, status: 'free' };
    entries.push({
      request: {
        method: 'POST',
        url: 'Slot',
      },
      resource: newSlot,
    });
  }

  // Execute the batch to create/update all resources at once
  const responseBundle = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries,
  });
  return responseBundle;
}
