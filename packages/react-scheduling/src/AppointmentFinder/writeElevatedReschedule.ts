// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import {
  extractServiceTypeReferences,
  generateId,
  getReferenceString,
  isDefined,
  serviceTypeIncludesService,
} from '@medplum/core';
import type { Appointment, Bundle, Schedule, Slot } from '@medplum/fhirtypes';
import type { AppointmentWrite } from './AppointmentFinder.writes';
import { readAppointmentWrite } from './AppointmentFinder.writes';
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
 * Moves an existing appointment without checking availability or start alignment.
 * Rebuilds geometry from current schedules and preserves the stored appointment's length and metadata.
 * Requires transaction support so a refused update cannot release the original slots.
 * @param medplum - The client to write through.
 * @param existing - The stored appointment, including its version.
 * @param proposal - The manually chosen start and schedules.
 * @returns The updated appointment and replacement slots, after verifying every response entry.
 */
export async function writeElevatedReschedule(
  medplum: MedplumClient,
  existing: WithId<Appointment>,
  proposal: Appointment
): Promise<AppointmentWrite> {
  if (!medplum.getProject()?.features?.includes('transaction-bundles')) {
    throw new Error('Manual rescheduling requires transaction support for this project.');
  }
  if (!existing.meta?.versionId) {
    throw new Error('Reload this appointment before manually rescheduling it; its version is missing.');
  }
  if (existing.status !== 'pending' && existing.status !== 'booked') {
    throw new Error('Only pending or booked appointments can be rescheduled.');
  }
  const durationMinutes = getRescheduleDurationMinutes(existing);
  const start = new Date(proposal.start ?? '');
  if (!durationMinutes || !Number.isFinite(start.getTime())) {
    throw new Error('Manual rescheduling requires a valid start and an existing appointment length.');
  }
  const serviceRefs = extractServiceTypeReferences(existing.serviceType);
  if (serviceRefs.length !== 1) {
    throw new Error('Manual rescheduling requires exactly one visit type.');
  }
  const scheduleRefs = [
    ...new Set(
      (proposal.contained ?? [])
        .filter((resource): resource is Slot => resource.resourceType === 'Slot')
        .map((slot) => slot.schedule.reference)
        .filter(isDefined)
    ),
  ];
  if (scheduleRefs.length === 0 || scheduleRefs.some((ref) => !/^Schedule\/[^/]+$/.test(ref))) {
    throw new Error('The chosen time must name valid schedules.');
  }
  const service = await medplum.readReference(serviceRefs[0], { cache: 'no-cache' });
  if (service.active === false) {
    throw new Error('The visit type is inactive.');
  }
  const schedules = await Promise.all(
    scheduleRefs.map((reference) => medplum.readReference<Schedule>({ reference }, { cache: 'no-cache' }))
  );
  if (
    schedules.some(
      (schedule) => schedule.active === false || !serviceTypeIncludesService(schedule.serviceType, service)
    )
  ) {
    throw new Error('Every selected schedule must be active and eligible for this visit type.');
  }
  const slotReferences = (existing.slot ?? []).map(getReferenceString);
  if (slotReferences.some((ref) => !ref)) {
    throw new Error('The appointment must reference stored slots before it can be manually rescheduled.');
  }
  const oldSlotRefs = [...new Set(slotReferences.filter(isDefined))];
  if (oldSlotRefs.some((ref) => !/^Slot\/[^/]+$/.test(ref))) {
    throw new Error('The appointment must reference stored slots before it can be manually rescheduled.');
  }
  const oldSlots = await Promise.all(
    oldSlotRefs.map((reference) => medplum.readReference<Slot>({ reference }, { cache: 'no-cache' }))
  );
  const oldScheduleRefs = [...new Set(oldSlots.map((slot) => getReferenceString(slot.schedule)))];
  const oldSchedules = await Promise.all(
    oldScheduleRefs.map((reference) => medplum.readReference<Schedule>({ reference }, { cache: 'no-cache' }))
  );
  const replacedRefs = new Set(
    oldSchedules.flatMap((schedule) => schedule.actor.map((actor) => actor.reference)).filter(isDefined)
  );
  const newActors = [
    ...new Map(schedules.flatMap((schedule) => schedule.actor).map((actor) => [actor.reference, actor])).values(),
  ];
  const newRefs = new Set(newActors.map((actor) => actor.reference).filter(isDefined));
  const kept = existing.participant.filter(
    (p) => !p.actor?.reference || !replacedRefs.has(p.actor.reference) || newRefs.has(p.actor.reference)
  );
  const keptRefs = new Set(kept.map((p) => p.actor?.reference).filter(isDefined));

  const geometry = buildElevatedBooking({ service, schedules, start, durationMinutes });
  const slots = (geometry.contained ?? [])
    .filter((resource): resource is Slot => resource.resourceType === 'Slot')
    .map((slot) =>
      existing.status === 'pending' && slot.status === 'busy' ? { ...slot, status: 'busy-tentative' as const } : slot
    );
  const slotUrls = slots.map(() => `urn:uuid:${generateId()}`);
  const appointment: WithId<Appointment> = {
    ...existing,
    start: geometry.start,
    end: geometry.end,
    slot: slotUrls.map((reference) => ({ reference })),
    participant: [
      ...kept,
      ...newActors
        .filter((actor) => actor.reference && !keptRefs.has(actor.reference))
        .map((actor) => ({ actor, required: 'required', status: 'needs-action' }) as const),
    ],
  };
  const bundle: Bundle<Appointment | Slot> = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      ...oldSlotRefs.map((url) => ({ request: { method: 'DELETE', url } as const })),
      ...slots.map((resource, index) => ({
        fullUrl: slotUrls[index],
        resource,
        request: { method: 'POST', url: 'Slot' } as const,
      })),
      {
        resource: appointment,
        request: { method: 'PUT', url: `Appointment/${existing.id}`, ifMatch: `W/"${existing.meta.versionId}"` },
      },
    ],
  };
  const response = (await medplum.executeBatch(bundle)) as Bundle<WithId<Appointment> | WithId<Slot>>;
  if (
    response.type !== 'transaction-response' ||
    response.entry?.length !== bundle.entry?.length ||
    response.entry?.some((entry) => !/^2\d\d(?:\s|$)/.test(entry.response?.status ?? ''))
  ) {
    throw new Error(
      'The manual reschedule transaction did not return a successful response for every write. Reload before retrying.'
    );
  }
  const result = readAppointmentWrite(response, 'Manual reschedule');
  const writtenSlotRefs = new Set(result.slots.map(getReferenceString));
  if (
    result.appointment.id !== existing.id ||
    result.slots.length !== slots.length ||
    result.slots.some((slot) => !slot.id) ||
    writtenSlotRefs.size !== slots.length ||
    result.appointment.slot?.length !== slots.length ||
    result.appointment.slot.some((ref) => !writtenSlotRefs.has(getReferenceString(ref)))
  ) {
    throw new Error(
      'The manual reschedule response is missing the updated appointment or replacement slots. Reload before retrying.'
    );
  }
  return result;
}
