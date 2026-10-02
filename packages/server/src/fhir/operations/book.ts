// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  created,
  deepEquals,
  getExtension,
  OperationOutcomeError,
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  RecurringAppointmentSeriesIdentifierSystem,
  validationRegexes,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, Extension } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import type { WithPath } from '../../util/withpath';
import { getPath, withPath } from '../../util/withpath';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  MAX_OCCURRENCE_COUNT,
  MIN_OCCURRENCE_COUNT,
  projectWeeksForward,
  weeklyRecurrenceTemplate,
} from './utils/recurrence';
import { createProposedAppointments } from './utils/scheduling';

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

// `Date.parse` also accepts times without an offset, and reads them in the server's own timezone,
// while FHIR's instant also allows a leap second that `Date.parse` can't read.
function requireInstant(value: string | undefined, path: string): asserts value is string {
  if (value === undefined || !validationRegexes.instant.test(value) || Number.isNaN(Date.parse(value))) {
    throw new OperationOutcomeError(
      badRequest('Times in a recurring series must be instants, with a timezone offset', path)
    );
  }
}

/**
 * Expands an Appointment carrying a weekly `recurrenceTemplate` into every occurrence of its
 * series, each tagged with the series identifier and its `recurrenceId`. An Appointment without
 * a template is returned alone, unchanged.
 *
 * @param proposed - The proposed Appointment, which is the series' first occurrence.
 * @returns Every occurrence to book, in order.
 */
function expandRecurrence(proposed: WithPath<Appointment>): WithPath<Appointment>[] {
  const extensions = proposed.extension ?? [];
  const templateIdx = extensions.findIndex((ext) => ext.url === RecurrenceTemplateExtensionURI);
  if (templateIdx < 0) {
    return [proposed];
  }
  const path = `${getPath(proposed)}.extension[${templateIdx}]`;
  const unsupported = (message: string): OperationOutcomeError =>
    new OperationOutcomeError(badRequest(`Unsupported recurrenceTemplate: ${message}`, path));

  if (extensions.filter((ext) => ext.url === RecurrenceTemplateExtensionURI).length > 1) {
    throw unsupported('an Appointment may carry only one');
  }

  // Assigned below; refused rather than silently replaced.
  const seriesIdentifierIdx =
    proposed.identifier?.findIndex((id) => id.system === RecurringAppointmentSeriesIdentifierSystem) ?? -1;
  if (seriesIdentifierIdx >= 0) {
    throw new OperationOutcomeError(
      badRequest(
        'A series identifier is assigned when a recurring series is booked, and must not be sent',
        `${getPath(proposed)}.identifier[${seriesIdentifierIdx}]`
      )
    );
  }
  const recurrenceIdIdx = extensions.findIndex((ext) => ext.url === RecurrenceIdExtensionURI);
  if (recurrenceIdIdx >= 0) {
    throw new OperationOutcomeError(
      badRequest(
        'recurrenceId is assigned when a recurring series is booked, and must not be sent',
        `${getPath(proposed)}.extension[${recurrenceIdIdx}]`
      )
    );
  }
  const template = extensions[templateIdx];
  const occurrenceCount = getExtension(template, 'occurrenceCount')?.valuePositiveInt;
  if (
    occurrenceCount === undefined ||
    !Number.isInteger(occurrenceCount) ||
    occurrenceCount < MIN_OCCURRENCE_COUNT ||
    occurrenceCount > MAX_OCCURRENCE_COUNT
  ) {
    throw unsupported(`occurrenceCount must be an integer between ${MIN_OCCURRENCE_COUNT} and ${MAX_OCCURRENCE_COUNT}`);
  }

  // Every time is shifted with its occurrence, so each must be an instant that can be.
  requireInstant(proposed.start, `${getPath(proposed)}.start`);
  requireInstant(proposed.end, `${getPath(proposed)}.end`);
  proposed.contained?.forEach((resource, i) => {
    if (resource.resourceType === 'Slot') {
      requireInstant(resource.start, `${getPath(proposed)}.contained[${i}].start`);
      requireInstant(resource.end, `${getPath(proposed)}.contained[${i}].end`);
    }
  });
  const start = new Date(proposed.start);
  const timezone = getExtension(template, 'timezone')?.valueCodeableConcept?.coding?.[0]?.code;
  let expected: Extension | undefined;
  // Temporal also accepts a UTC offset, which wouldn't follow DST as the series' local time must.
  if (timezone && !/^[+-]/.test(timezone)) {
    try {
      expected = weeklyRecurrenceTemplate(start, occurrenceCount, timezone);
    } catch {
      // An unknown timezone, refused below.
    }
  }
  if (!timezone || !expected) {
    throw unsupported('timezone must be an IANA timezone');
  }
  // Anything else, like `excludingDate` or another weekday, describes weeks this wouldn't book.
  if (!deepEquals(template, expected)) {
    throw unsupported("must be a weekly series on the first occurrence's weekday, as Appointment/$find returns it");
  }

  const projections: Date[] = [];
  for (let weeks = 0; weeks < occurrenceCount; weeks++) {
    const projected = projectWeeksForward(start, weeks, timezone);
    if (!projected) {
      throw unsupported(`occurrence ${weeks + 1} falls at a local time that doesn't exist in ${timezone}`);
    }
    projections.push(projected);
  }

  const seriesId = randomUUID();
  return projections.map((projected, idx) => {
    const shift = (instant: string): string =>
      new Date(Date.parse(instant) + projected.valueOf() - start.valueOf()).toISOString();
    const occurrence: Appointment = {
      ...proposed,
      start: shift(proposed.start as string),
      end: proposed.end && shift(proposed.end),
      // A period requested for the first occurrence says nothing about when the others were wanted.
      requestedPeriod: idx === 0 ? proposed.requestedPeriod : undefined,
      contained: proposed.contained?.map((resource) =>
        resource.resourceType === 'Slot'
          ? { ...resource, start: shift(resource.start), end: shift(resource.end) }
          : resource
      ),
      identifier: [
        ...(proposed.identifier ?? []),
        { system: RecurringAppointmentSeriesIdentifierSystem, value: seriesId },
      ],
      extension: [
        ...extensions.filter((ext) => idx === 0 || ext.url !== RecurrenceTemplateExtensionURI),
        { url: RecurrenceIdExtensionURI, valuePositiveInt: idx + 1 },
      ],
    };
    return withPath(occurrence, getPath(proposed));
  });
}

/**
 * Handles HTTP requests for the Appointment $book operation.
 *
 * Books one appointment or, given a weekly `recurrenceTemplate`, all or none of its series.
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
  const bundle = await createProposedAppointments(
    ctx.repo,
    expandRecurrence(withPath(params.appointment, 'Parameters.appointment')),
    (appointment) => {
      // Create appointment with "booked" status
      appointment.status = 'booked';
    }
  );

  return [created, buildOutputParameters(bookOperation, bundle)];
}
