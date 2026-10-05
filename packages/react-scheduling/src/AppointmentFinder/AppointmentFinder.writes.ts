// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { isDefined } from '@medplum/core';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';

/** What a scheduling operation wrote: the appointment, and the times it holds. */
export interface AppointmentWrite {
  readonly appointment: WithId<Appointment>;
  /** The times reserved for it, one set per schedule it is held on. */
  readonly slots: readonly WithId<Slot>[];
}

/**
 * Reads what a scheduling operation wrote out of the bundle it answers with.
 *
 * `$book` and `$reschedule` both answer with the appointment and every Slot they
 * created, in one transaction bundle.
 *
 * @param written - The bundle the operation returned.
 * @param operation - What was called, for the error a bundle without an appointment raises.
 * @returns The appointment and the times reserved for it.
 */
export function readAppointmentWrite(
  written: Bundle<WithId<Appointment> | WithId<Slot>>,
  operation: string
): AppointmentWrite {
  const resources = (written.entry ?? []).map((entry) => entry.resource).filter(isDefined);
  const slots = resources.filter((resource) => resource.resourceType === 'Slot');
  const appointments = resources.filter((resource) => resource.resourceType === 'Appointment');
  const [appointment] = appointments;

  // Medplum server's `$book` and `$reschedule` return exactly one appointment
  if (appointments.length > 1) {
    throw new Error(`${operation} returned multiple appointments`);
  }
  if (!appointment) {
    throw new Error(`${operation} returned no appointment`);
  }
  return { appointment, slots };
}
