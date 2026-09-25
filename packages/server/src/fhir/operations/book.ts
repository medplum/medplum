// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, created, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { getPath, withPath } from '../../util/withpath';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  assertNoSeriesTags,
  expandWeeklySeries,
  readWeeklyTemplate,
  seriesTimezone,
  tagWeeklySeries,
  weekdayOf,
} from './utils/recurrence';
import { createProposedAppointment, createProposedAppointments } from './utils/scheduling';

const bookOperation = makeOperationDefinition(
  { scope: 'type', resource: 'Appointment' },
  {
    name: 'book',
    code: 'book',
    parameter: [
      { use: 'in', name: 'appointment', type: 'Appointment', min: 1, max: '1' },
      { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
    ],
  }
);

type BookParameters = {
  appointment: Appointment;
};

/**
 * Handles HTTP requests for the Appointment $book operation.
 *
 * Books one appointment, or all or none of the occurrences of a weekly series, generated from
 * the `recurrenceTemplate` carried by the series' first occurrence.
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
  const proposed = withPath(params.appointment, 'Parameters.appointment');
  const template = readWeeklyTemplate(proposed);

  if (!template) {
    const bundle = await createProposedAppointment(ctx.repo, proposed, (appointment) => {
      // Create appointment with "booked" status
      appointment.status = 'booked';
    });
    return [created, buildOutputParameters(bookOperation, bundle)];
  }

  assertNoSeriesTags(proposed);
  const bundle = await createProposedAppointments(ctx.repo, expandWeeklySeries(proposed, template), (validated) => {
    const timezone = seriesTimezone(validated.flatMap(({ schedulingParameters }) => schedulingParameters));
    // The template chose the weeks booked, before the schedules were read.
    if (template.timezone !== timezone) {
      throw new OperationOutcomeError(
        badRequest(`recurrenceTemplate timezone must be the schedules' timezone, ${timezone}`, getPath(template))
      );
    }
    const [{ appointment: first, slots }] = validated;
    const weekday = weekdayOf(first.start as string, timezone);
    if (template.weekday !== weekday) {
      throw new OperationOutcomeError(
        badRequest(`recurrenceTemplate must recur on the first occurrence's weekday, ${weekday}`, getPath(template))
      );
    }
    // The series recurs from the first occurrence's start, so that must be the time its Slots book.
    const mismatched = slots.some(
      (slot) =>
        slot.status === 'busy' &&
        (Date.parse(slot.start) !== Date.parse(first.start ?? '') ||
          Date.parse(slot.end) !== Date.parse(first.end ?? ''))
    );
    if (mismatched) {
      throw new OperationOutcomeError(
        badRequest("Appointment start and end must match its busy Slot's", getPath(proposed))
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
