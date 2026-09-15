// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumRequestOptions } from '@medplum/core';
import {
  badRequest,
  extractServiceTypeReferences,
  isDefined,
  OperationOutcomeError,
  resolveId,
  serviceTypeIncludesService,
} from '@medplum/core';
import type {
  Appointment,
  AppointmentParticipant,
  Bundle,
  HealthcareService,
  Parameters,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { isBookableActorType } from '../actors';
import { getServiceDurationMinutes } from '../AppointmentFinder/AppointmentServiceSelect.utils';

/** Fallback visit length for a service that configures none. */
const DEFAULT_DURATION_MINUTES = 30;

/**
 * Answers `Appointment/[id]/$reschedule` against the stored resources.
 *
 * `MockClient` has no scheduling operations, so a story or test that moves a visit has
 * to stand in for the server. It does what the operation does to the resources:
 * releases the Slots the appointment was holding, creates new ones on the schedules it was
 * asked for, and swaps the actors of the schedules it moved off for the actors of the
 * ones it moved to. Like the operation, it leaves the visit type on file alone.
 *
 * Limitations:
 * - Does not check availability
 * - Does not check start time alignment
 * - Does not create buffer slots
 *
 * @param medplum - The client to patch. Other requests are passed through.
 * @returns A function restoring the client's own `post`.
 */
export function installRescheduleStub(medplum: MedplumClient): () => void {
  const original = medplum.post.bind(medplum);

  medplum.post = async function stubbedPost<T>(
    url: string | URL,
    body?: unknown,
    contentType?: string,
    options?: MedplumRequestOptions
  ): Promise<T> {
    const match = /Appointment\/([^/]+)\/(?:%24|\$)reschedule$/.exec(url.toString());
    if (!match) {
      return original(url, body, contentType, options);
    }
    return rescheduleAppointment(medplum, match[1], body as Parameters) as Promise<T>;
  } as MedplumClient['post'];

  return () => {
    medplum.post = original;
  };
}

async function rescheduleAppointment(medplum: MedplumClient, id: string, parameters: Parameters): Promise<Bundle> {
  const start = parameters.parameter?.find((parameter) => parameter.name === 'start')?.valueDateTime;
  const serviceReference = parameters.parameter?.find((parameter) => parameter.name === 'service-type-reference')
    ?.valueReference as Reference<HealthcareService> | undefined;
  const scheduleReferences = (parameters.parameter ?? [])
    .filter((parameter) => parameter.name === 'schedule')
    .map((parameter) => parameter.valueReference)
    .filter(isDefined) as Reference<Schedule>[];

  if (!start || !serviceReference || scheduleReferences.length === 0) {
    throw new OperationOutcomeError(badRequest('$reschedule was called without a time to move to'));
  }

  const appointment = await medplum.readResource('Appointment', id);
  if (appointment.status !== 'pending' && appointment.status !== 'booked') {
    throw new OperationOutcomeError(badRequest(`Appointment cannot be rescheduled in '${appointment.status}' status`));
  }

  const service = await medplum.readReference(serviceReference);
  // The visit type is read, never written: a move cannot change what a visit is.
  if (
    extractServiceTypeReferences(appointment.serviceType).length > 0 &&
    !serviceTypeIncludesService(appointment.serviceType, service)
  ) {
    throw new OperationOutcomeError(badRequest('Appointment is on file for a different service type'));
  }

  const schedules = await Promise.all(scheduleReferences.map(async (reference) => medplum.readReference(reference)));

  const durationMinutes = getServiceDurationMinutes(service) ?? DEFAULT_DURATION_MINUTES;
  const end = new Date(new Date(start).getTime() + durationMinutes * 60 * 1000).toISOString();

  // The times it was holding go back, which is what frees the schedules it moves off.
  await Promise.all(
    (appointment.slot ?? []).map(async (reference) => {
      const slotId = resolveId(reference);
      if (slotId) {
        await medplum.deleteResource('Slot', slotId);
      }
    })
  );

  const slots = await Promise.all(
    schedules.map(async (schedule) =>
      medplum.createResource<Slot>({
        resourceType: 'Slot',
        status: appointment.status === 'pending' ? 'busy-tentative' : 'busy',
        start,
        end,
        schedule: { reference: `Schedule/${schedule.id}` },
      })
    )
  );

  const rescheduled = await medplum.updateResource<Appointment>({
    ...appointment,
    start,
    end,
    participant: resolveParticipants(appointment, schedules),
    slot: slots.map((slot) => ({ reference: `Slot/${slot.id}` })),
  });

  return {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: [rescheduled, ...slots].map((resource) => ({ resource })),
  };
}

/**
 * Swaps the actors a visit is held on for the actors of the schedules it moved to,
 * leaving everybody else — the patient above all — where they were.
 *
 * The operation itself replaces only the actors of the schedules being moved off, which
 * it reads back through the released Slots. The stub replaces every schedulable actor
 * instead, which comes to the same thing for a visit held on its actors' own schedules.
 *
 * @param appointment - The appointment as it stood.
 * @param schedules - The schedules it is moving to.
 * @returns The participants of the moved appointment.
 */
function resolveParticipants(appointment: Appointment, schedules: readonly Schedule[]): AppointmentParticipant[] {
  const newActors = [...new Map(schedules.flatMap((schedule) => schedule.actor).map((a) => [a.reference, a])).values()];
  const newReferences = new Set(newActors.map((actor) => actor.reference));

  const kept = appointment.participant.filter((participant) => {
    const actorType = participant.actor?.reference?.split('/')[0];
    return !actorType || !isBookableActorType(actorType) || newReferences.has(participant.actor?.reference);
  });
  const keptReferences = new Set(kept.map((participant) => participant.actor?.reference).filter(isDefined));

  return [
    ...kept,
    ...newActors
      .filter((actor) => actor.reference && !keptReferences.has(actor.reference))
      .map((actor) => ({ actor, required: 'required', status: 'needs-action' }) as const),
  ];
}
