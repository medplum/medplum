// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, MedplumClient, resolveId } from '@medplum/core';
import { Appointment } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Appointment>): Promise<Appointment> {
  let appointment = event.input;

  // Basic data validation
  const slotId = resolveId(appointment.slot?.[0]);
  if (!slotId) {
    throw new Error('Must provide a slot');
  }

  if (!appointment.appointmentType) {
    throw new Error('Must provide an appointment type');
  }

  if (!appointment.serviceType || appointment.serviceType?.length === 0) {
    throw new Error('Must provide a service type');
  }

  if (appointment.status !== 'booked') {
    throw new Error('Appointment status must be "booked"');
  }

  const slot = await medplum.readResource('Slot', slotId);

  // Create the appointment
  appointment.start = slot.start;
  appointment.end = slot.end;
  appointment = await medplum.createResource(appointment);

  // Update the slot status to 'busy'
  slot.status = 'busy';
  await medplum.updateResource(slot);

  return appointment;
}
