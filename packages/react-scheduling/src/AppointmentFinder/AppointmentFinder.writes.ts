// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { isDefined } from '@medplum/core';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';

/** What a scheduling operation wrote: the appointments, and the times they hold. */
export interface AppointmentWrite {
  /**
   * Every appointment written: one, or each occurrence of a recurring series in the
   * order they fall. Never empty.
   */
  readonly appointments: readonly [WithId<Appointment>, ...WithId<Appointment>[]];
  /**
   * The first appointment written.
   *
   * @deprecated Use `appointments[0]`, followed there by any later occurrences of a
   * recurring series. Kept while hosts migrate, and to be removed in a later release.
   */
  readonly appointment: WithId<Appointment>;
  /** The times reserved for them, one set per schedule each is held on. */
  readonly slots: readonly WithId<Slot>[];
}

/** What {@link readAppointmentWrite} expects of the bundle it reads. */
export interface ReadAppointmentWriteOptions {
  /** Accept more than one appointment, as `$book` writes for a recurring series. */
  readonly allowSeries?: boolean;
}

/**
 * Reads what a scheduling operation wrote out of the bundle it answers with.
 *
 * `$book` and `$reschedule` both answer with the appointment and every Slot they
 * created, in one transaction bundle.
 *
 * @param written - The bundle the operation returned.
 * @param operation - What was called, for the error a bundle without an appointment raises.
 * @param options - Whether a recurring series, written as several appointments, is expected.
 * @returns The appointments and the times reserved for them.
 */
export function readAppointmentWrite(
  written: Bundle<WithId<Appointment> | WithId<Slot>>,
  operation: string,
  options: ReadAppointmentWriteOptions = {}
): AppointmentWrite {
  const resources = (written.entry ?? []).map((entry) => entry.resource).filter(isDefined);
  const slots = resources.filter((resource) => resource.resourceType === 'Slot');
  const [appointment, ...rest] = resources.filter((resource) => resource.resourceType === 'Appointment');

  // Medplum server's `$reschedule` returns exactly one appointment, and `$book` one per occurrence
  if (rest.length > 0 && !options.allowSeries) {
    throw new Error(`${operation} returned multiple appointments`);
  }
  if (!appointment) {
    throw new Error(`${operation} returned no appointment`);
  }
  return { appointments: [appointment, ...rest], appointment, slots };
}
