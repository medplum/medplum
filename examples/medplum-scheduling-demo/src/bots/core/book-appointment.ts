import { BotEvent, MedplumClient } from '@medplum/core';
import { Appointment } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Appointment>): Promise<Appointment> {
  let appointment = event.input;

  // Basic validation
  const slotId = appointment.slot?.[0].reference?.split('Slot/')[1];
  if (!slotId) {
    throw new Error('Must provide a slot');
  }

  if (appointment.serviceType?.length === 0) {
    throw new Error('Must provide a  type');
  }

  if (appointment.participant?.length !== 2) {
    throw new Error('Must provide a patient and a practitioner');
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
