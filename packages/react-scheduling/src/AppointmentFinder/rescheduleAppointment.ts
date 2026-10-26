// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { isDefined, resolveId } from '@medplum/core';
import type { Appointment, Bundle, Parameters, Slot } from '@medplum/fhirtypes';
import type { AppointmentWrite } from './AppointmentFinder.writes';
import { readAppointmentWrite } from './AppointmentFinder.writes';
import type { BookOptions } from './AppointmentProposalForm';
import { getProposedSchedules, writeElevatedReschedule } from './writeElevatedReschedule';

/**
 * Moves an appointment onto the time and schedules a proposal names.
 *
 * Searched times use `Appointment/[id]/$reschedule`, keeping the configured length. Manually
 * entered times and lengths create the new Slots, move the appointment onto them, then delete
 * the old Slots. Announces the appointment, the times it gave up and the times it took, so
 * views reading them refresh.
 *
 * @param medplum - The client to write through.
 * @param appointment - The appointment being moved.
 * @param proposal - The time it is moving to, as the form proposed it.
 * @param options - Whether the time was typed rather than searched.
 * @returns What the move wrote.
 */
export async function rescheduleAppointment(
  medplum: MedplumClient,
  appointment: WithId<Appointment>,
  proposal: Appointment,
  options: BookOptions
): Promise<AppointmentWrite> {
  const schedules = getProposedSchedules(proposal);

  // Always present, whether the time came from `$find` or was typed.
  if (!proposal.start) {
    throw new Error('The chosen time does not say when it is');
  }
  if (schedules.length === 0) {
    throw new Error('The chosen time does not say which schedules to hold it on');
  }

  if (options.manual) {
    // Written through CRUD methods, which announce their own changes.
    return writeElevatedReschedule(medplum, appointment, proposal);
  }

  // Read before the request: the operation deletes these, and the appointment comes
  // back pointing at the times it took instead.
  const releasedSlotIds = (appointment.slot ?? []).map(resolveId).filter(isDefined);
  const result = readAppointmentWrite(
    await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
      medplum.fhirUrl('Appointment', appointment.id, '$reschedule'),
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'start', valueDateTime: proposal.start },
          ...schedules.map((reference) => ({ name: 'schedule', valueReference: { reference } })),
        ],
      } satisfies Parameters
    ),
    '$reschedule'
  );

  // `$reschedule` is a custom operation, so the client cannot tell what it changed: the
  // old slots were deleted, new ones created, and `appointment.slot` repointed.
  for (const moved of result.appointments) {
    medplum.notifyResourceModified({
      resourceType: 'Appointment',
      operation: 'update',
      id: moved.id,
      resource: moved,
    });
  }
  for (const id of releasedSlotIds) {
    medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'delete', id });
  }
  for (const slot of result.slots) {
    medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'create', id: slot.id, resource: slot });
  }
  return result;
}

/**
 * The day the time search opens on: the day the visit is on now.
 *
 * Floored at today, since a visit can only be moved forwards — opening the calendar on
 * the month a missed visit used to be in would point away from everything on offer.
 *
 * @param appointment - The appointment being moved.
 * @returns The day to open on.
 */
export function getOpeningDay(appointment: Appointment): Date {
  const now = new Date();
  const start = appointment.start ? new Date(appointment.start) : undefined;
  return start && start > now ? start : now;
}
