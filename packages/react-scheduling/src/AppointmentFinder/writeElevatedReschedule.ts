// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import {
  createReference,
  extractServiceTypeReferences,
  getReferenceString,
  isDefined,
  isValidDate,
  rescheduleParticipants,
  SchedulingUnvalidatedRescheduleURI,
  serviceTypeIncludesService,
  withRescheduleMarker,
} from '@medplum/core';
import type { Appointment, Schedule, Slot } from '@medplum/fhirtypes';
import type { AppointmentWrite } from './AppointmentFinder.writes';
import { buildElevatedBooking } from './buildElevatedBooking';

/**
 * Reads the stored interval without rounding fractional minutes.
 * @param appointment - The appointment being moved.
 * @returns Its positive duration, or undefined for a missing or invalid interval.
 */
export function getRescheduleDurationMinutes(appointment: Appointment): number | undefined {
  const duration = (Date.parse(appointment.end ?? '') - Date.parse(appointment.start ?? '')) / 60000;
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

/**
 * The Schedules a proposed time would be held on.
 *
 * Read off the proposal's contained Slots, since the proposal is what is being written.
 *
 * @param proposal - A time as `$find` offered it, or as typed.
 * @returns The schedule references, deduped — a schedule holds a buffer Slot either
 * side of the visit as well as the visit's own.
 */
export function getProposedSchedules(proposal: Appointment): string[] {
  const slots = (proposal.contained ?? []).filter((resource): resource is Slot => resource.resourceType === 'Slot');
  return [...new Set(slots.map((slot) => slot.schedule.reference).filter(isDefined))];
}

/**
 * Moves an existing appointment without checking availability or start alignment.
 * Rebuilds geometry from current schedules and preserves the stored appointment's length and metadata,
 * marking it with `SchedulingUnvalidatedReschedule`.
 *
 * Writes in order: creates the new Slots, moves the appointment onto them with one
 * conditional update, then deletes the old Slots. The appointment is only ever wholly at its
 * old time or wholly at its new one. A failure before the update deletes the Slots it created;
 * a failure after it leaves the old Slots behind, logged, with the move complete.
 * @param medplum - The client to write through.
 * @param moving - The appointment being moved. Re-read before writing, so a stale copy is not written back.
 * @param proposal - The manually chosen start and schedules.
 * @returns The updated appointment and its new slots.
 */
export async function writeElevatedReschedule(
  medplum: MedplumClient,
  moving: WithId<Appointment>,
  proposal: Appointment
): Promise<AppointmentWrite> {
  const scheduleRefs = getProposedSchedules(proposal);
  if (scheduleRefs.length === 0 || scheduleRefs.some((ref) => !/^Schedule\/[^/]+$/.test(ref))) {
    throw new Error('The chosen time must name valid schedules.');
  }
  const [existing, schedules] = await Promise.all([
    medplum.readResource('Appointment', moving.id, { cache: 'no-cache' }),
    Promise.all(scheduleRefs.map((reference) => medplum.readReference<Schedule>({ reference }, { cache: 'no-cache' }))),
  ]);
  if (!existing.meta?.versionId) {
    throw new Error('Reload this appointment before manually rescheduling it; its version is missing.');
  }
  if (existing.status !== 'pending' && existing.status !== 'booked') {
    throw new Error('Only pending or booked appointments can be rescheduled.');
  }
  const durationMinutes = getRescheduleDurationMinutes(existing);
  const start = new Date(proposal.start ?? '');
  if (!durationMinutes || !isValidDate(start)) {
    throw new Error('Manual rescheduling requires a valid start and an existing appointment length.');
  }
  const serviceRefs = extractServiceTypeReferences(existing.serviceType);
  if (serviceRefs.length !== 1) {
    throw new Error('Manual rescheduling requires exactly one visit type.');
  }
  const oldSlotRefs = [...new Set((existing.slot ?? []).map(getReferenceString))];
  if (oldSlotRefs.some((ref) => !ref || !/^Slot\/[^/]+$/.test(ref))) {
    throw new Error('The appointment must reference stored slots before it can be manually rescheduled.');
  }
  const [service, oldSlots] = await Promise.all([
    medplum.readReference(serviceRefs[0], { cache: 'no-cache' }),
    Promise.all(oldSlotRefs.map((reference) => medplum.readReference<Slot>({ reference }, { cache: 'no-cache' }))),
  ]);
  if (service.active === false) {
    throw new Error('The visit type is inactive.');
  }
  // `$find`, `$book` and `$reschedule` refuse multi-actor Schedules, so an appointment
  // written onto one could not be moved again.
  if (
    schedules.some(
      (schedule) =>
        schedule.active === false ||
        schedule.actor.length !== 1 ||
        !serviceTypeIncludesService(schedule.serviceType, service)
    )
  ) {
    throw new Error(
      'Every selected schedule must be active, have exactly one actor, and be eligible for this visit type.'
    );
  }
  // A move that keeps its schedules is moving off ones already read above.
  const loadedSchedules = new Map(scheduleRefs.map((reference, index) => [reference, schedules[index]]));
  const oldScheduleRefs = [...new Set(oldSlots.map((slot) => getReferenceString(slot.schedule)))];
  const oldSchedules = await Promise.all(
    oldScheduleRefs.map(
      (reference) =>
        (reference ? loadedSchedules.get(reference) : undefined) ??
        medplum.readReference<Schedule>({ reference }, { cache: 'no-cache' })
    )
  );

  const geometry = buildElevatedBooking({ service, schedules, start, durationMinutes });
  const slots = (geometry.contained ?? [])
    .filter((resource): resource is Slot => resource.resourceType === 'Slot')
    .map((slot) =>
      existing.status === 'pending' && slot.status === 'busy' ? { ...slot, status: 'busy-tentative' as const } : slot
    );
  const created = await Promise.allSettled(slots.map((slot) => medplum.createResource(slot)));
  const newSlots = created.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failedCreate = created.find((result) => result.status === 'rejected');
  if (failedCreate) {
    await deleteSlots(medplum, newSlots);
    throw failedCreate.reason;
  }

  const updated: WithId<Appointment> = {
    ...existing,
    extension: withRescheduleMarker(existing.extension, {
      url: SchedulingUnvalidatedRescheduleURI,
      valueBoolean: true,
    }),
    start: geometry.start,
    end: geometry.end,
    slot: newSlots.map((slot) => createReference(slot)),
    participant: rescheduleParticipants(existing.participant, oldSchedules, schedules),
  };
  let appointment: WithId<Appointment>;
  try {
    appointment = await medplum.updateResource(updated, {
      headers: { 'If-Match': `W/"${existing.meta.versionId}"` },
    });
  } catch (error) {
    await deleteSlots(medplum, newSlots);
    throw error;
  }

  await deleteSlots(medplum, oldSlots);
  return { appointment, slots: newSlots };
}

/**
 * Deletes Slots, logging any that could not be deleted rather than failing.
 * @param medplum - The client to write through.
 * @param slots - The Slots to delete.
 */
async function deleteSlots(medplum: MedplumClient, slots: readonly WithId<Slot>[]): Promise<void> {
  const results = await Promise.allSettled(slots.map((slot) => medplum.deleteResource('Slot', slot.id)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Could not delete Slot/${slots[index].id}`, result.reason);
    }
  });
}
