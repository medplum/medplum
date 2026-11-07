// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  deepEquals,
  getExtension,
  OperationOutcomeError,
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  RecurringAppointmentSeriesIdentifierSystem,
  UCUM,
  validationRegexes,
} from '@medplum/core';
import type { Appointment, Extension } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import { getExtensions } from '../../../util/extension';
import type { WithPath } from '../../../util/withpath';
import { getPath, withPath } from '../../../util/withpath';

// The fewest and most occurrences a weekly series may have. One occurrence isn't a series.
export const MIN_OCCURRENCE_COUNT = 2;
export const MAX_OCCURRENCE_COUNT = 6;

// Indexed by `Temporal.ZonedDateTime.dayOfWeek - 1`, and named for R5's `weeklyTemplate` elements.
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

/**
 * Projects an instant forward by whole weeks, keeping its wall-clock time in `timezone` across DST
 * transitions.
 *
 * @param start - The instant to project.
 * @param weeks - How many weeks forward to project it.
 * @param timezone - The IANA timezone whose wall-clock time to keep.
 * @returns The projected instant. Undefined if that wall-clock time doesn't exist that week, as in a
 * DST gap; one that happens twice, as in a DST fall-back, is the earlier.
 */
export function projectWeeksForward(start: Date, weeks: number, timezone: string): Date | undefined {
  const local = Temporal.Instant.fromEpochMilliseconds(start.valueOf()).toZonedDateTimeISO(timezone);
  const projected = local.add({ weeks });
  return projected.toPlainTime().equals(local.toPlainTime()) ? new Date(projected.epochMilliseconds) : undefined;
}

/**
 * Builds R5's `recurrenceTemplate` for a weekly series, as the R4 cross-version extension.
 *
 * @param start - The series' first occurrence.
 * @param occurrenceCount - How many occurrences the series has.
 * @param timezone - The IANA timezone whose wall-clock time the series keeps.
 * @returns The `recurrenceTemplate` extension.
 */
export function weeklyRecurrenceTemplate(start: Date, occurrenceCount: number, timezone: string): Extension {
  const local = Temporal.Instant.fromEpochMilliseconds(start.valueOf()).toZonedDateTimeISO(timezone);
  return {
    url: RecurrenceTemplateExtensionURI,
    extension: [
      {
        url: 'timezone',
        valueCodeableConcept: { coding: [{ system: 'https://www.iana.org/time-zones', code: timezone }] },
      },
      { url: 'recurrenceType', valueCodeableConcept: { coding: [{ system: UCUM, code: 'wk', display: 'week' }] } },
      { url: 'occurrenceCount', valuePositiveInt: occurrenceCount },
      {
        url: 'weeklyTemplate',
        extension: [
          { url: WEEKDAYS[local.dayOfWeek - 1], valueBoolean: true },
          { url: 'weekInterval', valuePositiveInt: 1 },
        ],
      },
    ],
  };
}

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
export function expandRecurrence(proposed: WithPath<Appointment>): WithPath<Appointment>[] {
  const extensions = proposed.extension ?? [];

  const templates = getExtensions(proposed, RecurrenceTemplateExtensionURI);
  const template = templates[0];
  if (!template) {
    return [proposed];
  }
  if (templates.length > 1) {
    throw new OperationOutcomeError(
      badRequest(
        'Too many recurrenceTemplate extensions',
        templates.map((template) => getPath(template))
      )
    );
  }

  // Assigned below; refused rather than silently replaced.
  const seriesIdentifierIdx =
    proposed.identifier?.findIndex((id) => id.system === RecurringAppointmentSeriesIdentifierSystem) ?? -1;
  if (seriesIdentifierIdx >= 0) {
    throw new OperationOutcomeError(
      badRequest(
        'A series identifier is assigned to each occurrence of a recurring series, and must not be sent',
        `${getPath(proposed)}.identifier[${seriesIdentifierIdx}]`
      )
    );
  }
  const recurrenceIdIdx = extensions.findIndex((ext) => ext.url === RecurrenceIdExtensionURI);
  if (recurrenceIdIdx >= 0) {
    throw new OperationOutcomeError(
      badRequest(
        'recurrenceId is assigned to each occurrence of a recurring series, and must not be sent',
        `${getPath(proposed)}.extension[${recurrenceIdIdx}]`
      )
    );
  }

  const unsupported = (message: string): OperationOutcomeError =>
    new OperationOutcomeError(badRequest(`Unsupported recurrenceTemplate: ${message}`, getPath(template)));

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
