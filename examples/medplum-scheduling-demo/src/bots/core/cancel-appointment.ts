import { BotEvent, MedplumClient, resolveId } from '@medplum/core';
import { Appointment, Slot } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Appointment>): Promise<Appointment> {
  let appointment = event.input;

  // Basic data validation
  const slotId = resolveId(appointment.slot?.[0]);
  if (!slotId) {
    throw new Error('Must provide a slot');
  }

  // Update the appointment status to 'cancelled'
  appointment.status = 'cancelled';
  appointment = await medplum.updateResource(appointment);

  // Instead of unlinking the original slot, create a new slot with status 'free'
  // so it can be booked again
  const slot = await medplum.readResource('Slot', slotId);
  const existingFreeSlot = await medplum.searchOne('Slot', {
    start: slot.start,
    status: 'free',
  });
  if (!existingFreeSlot) {
    const newSlot: Slot = { ...slot, id: undefined, status: 'free' };
    await medplum.createResource(newSlot);
  }

  return appointment;
}
