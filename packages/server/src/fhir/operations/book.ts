// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { arrayify, badRequest, created, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { getPath, withPath, withPaths } from '../../util/withpath';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { recursWeekly, tagWeeklySeries } from './utils/recurrence';
import { createProposedAppointment, createProposedAppointments } from './utils/scheduling';
import { extractCommonParameters } from './utils/scheduling-parameters';

const bookOperation = makeOperationDefinition(
  { scope: 'type', resource: 'Appointment' },
  {
    name: 'book',
    code: 'book',
    parameter: [
      { use: 'in', name: 'appointment', type: 'Appointment', min: 1, max: '6' },
      { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
    ],
  }
);

type BookParameters = {
  appointment: Appointment | Appointment[];
};

/**
 * Handles HTTP requests for the Appointment $book operation.
 *
 * Books one appointment, or all or none of the occurrences of a weekly series.
 *
 * Endpoints:
 *   [fhir base]/Appointment/$book
 *
 * @experimental - Scheduling Beta API
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentBookHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<BookParameters>(bookOperation, req);
  const appointments = arrayify(params.appointment);

  if (appointments.length === 1) {
    const bundle = await createProposedAppointment(
      ctx.repo,
      withPath(appointments[0], 'Parameters.appointment'),
      (appointment) => {
        // Create appointment with "booked" status
        appointment.status = 'booked';
      }
    );
    return [created, buildOutputParameters(bookOperation, bundle)];
  }

  // Sorted so the first occurrence is created first, for the others to refer back to.
  const occurrences = withPaths(appointments, 'Parameters.appointment').toSorted(
    (left, right) => Date.parse(left.start ?? '') - Date.parse(right.start ?? '')
  );
  const bundle = await createProposedAppointments(ctx.repo, occurrences, (validated) => {
    const timezones = validated.map(
      ({ schedulingParameters }) => extractCommonParameters(schedulingParameters).alignmentTimezone
    );
    const timezone = timezones[0];
    if (timezones.some((other) => other !== timezone)) {
      throw new OperationOutcomeError(badRequest('All appointments in a recurring series must share one timezone'));
    }
    // The series is checked on the appointments' times, so those must be the times actually booked.
    for (const [idx, { appointment, slots }] of validated.entries()) {
      const mismatched = slots.some(
        (slot) =>
          slot.status === 'busy' &&
          (Date.parse(slot.start) !== Date.parse(appointment.start ?? '') ||
            Date.parse(slot.end) !== Date.parse(appointment.end ?? ''))
      );
      if (mismatched) {
        throw new OperationOutcomeError(
          badRequest("Appointment start and end must match its busy Slot's", getPath(occurrences[idx]))
        );
      }
    }
    if (
      !recursWeekly(
        validated.map((occurrence) => occurrence.appointment.start),
        timezone
      )
    ) {
      throw new OperationOutcomeError(
        badRequest('Appointments in a recurring series must be one week apart, at the same local time')
      );
    }
    return tagWeeklySeries(
      validated.map(({ appointment }) => ({ ...appointment, status: 'booked' })),
      randomUUID(),
      timezone
    );
  });

  return [created, buildOutputParameters(bookOperation, bundle)];
}
