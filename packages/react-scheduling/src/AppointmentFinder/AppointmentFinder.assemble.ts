// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment, CodeableConcept, Patient, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import type { SchedulingActor } from './AppointmentFinder.roles';
import { getActorGroupKey } from './AppointmentFinder.times';

/**
 * Finds the appointment offered at an exact time by an exact set of actors.
 *
 * Used to answer a request for a specific time: matching one of the offered
 * times hands back the server's own proposal, `contained` Slots and all, rather
 * than a look-alike built here.
 *
 * @param appointments - Proposed appointments from `$find`.
 * @param start - The requested start time.
 * @param actorsKey - The actors it must be with, from `getActorsKey`.
 * @returns The matching appointment, if one was offered.
 */
export function findAppointmentAt(
  appointments: readonly Appointment[],
  start: Date,
  actorsKey?: string
): Appointment | undefined {
  return appointments.find(
    (appointment) =>
      !!appointment.start &&
      new Date(appointment.start).getTime() === start.getTime() &&
      (actorsKey === undefined || getActorGroupKey(appointment) === actorsKey)
  );
}

export interface CustomAppointmentOptions {
  readonly start: Date;
  readonly durationMinutes: number;
  readonly actors: readonly SchedulingActor[];
  /** Schedules to hold the time on, which become the Slots a booking needs. */
  readonly schedules?: readonly Reference<Schedule>[];
  readonly serviceType?: CodeableConcept[];
}

/**
 * Builds a proposed Appointment for a time the server did not offer.
 *
 * Shaped like a `$find` result so a caller can handle it the same way, but the
 * times in it were never checked against anybody's availability: it exists for
 * the case where a user has decided to book over whatever is there.
 *
 * @param options - The time, length, actors, and schedules to hold.
 * @returns A proposed Appointment.
 */
export function buildCustomAppointment(options: CustomAppointmentOptions): Appointment {
  const start = options.start.toISOString();
  const end = new Date(options.start.getTime() + options.durationMinutes * 60 * 1000).toISOString();

  const contained: Slot[] = (options.schedules ?? []).map((schedule) => ({
    resourceType: 'Slot',
    status: 'busy',
    schedule,
    start,
    end,
  }));

  return {
    resourceType: 'Appointment',
    status: 'proposed',
    start,
    end,
    serviceType: options.serviceType,
    participant: options.actors.map((actor) => ({ actor, required: 'required', status: 'needs-action' })),
    contained: contained.length > 0 ? contained : undefined,
  };
}

export interface AppointmentBookingDetails {
  /** Who the appointment is for. Added as a participant if it is not one already. */
  readonly patient?: Reference<Patient>;
  /** Why the visit is happening, recorded for the practice. */
  readonly comment?: string;
  /** What the patient is told to do before the visit. */
  readonly patientInstruction?: string;
}

/**
 * Fills in the parts of a proposed appointment that only the person booking it
 * knows.
 *
 * `$find` proposes a time on a set of calendars and nothing more, so the patient
 * and anything written about the visit are added here, on the way to `$book`.
 * The proposal is left otherwise untouched, `contained` Slots and all, because
 * the server validates what it produced against what comes back.
 *
 * @param appointment - The proposed appointment being booked.
 * @param details - The patient and notes gathered while confirming.
 * @returns A copy of the appointment, ready to book.
 */
export function applyBookingDetails(appointment: Appointment, details: AppointmentBookingDetails): Appointment {
  const participant = [...(appointment.participant ?? [])];
  const patientReference = details.patient?.reference;

  if (details.patient && !participant.some((existing) => existing.actor?.reference === patientReference)) {
    participant.push({ actor: details.patient, required: 'required', status: 'accepted' });
  }

  return {
    ...appointment,
    participant,
    comment: trimToUndefined(details.comment) ?? appointment.comment,
    patientInstruction: trimToUndefined(details.patientInstruction) ?? appointment.patientInstruction,
  };
}

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}
