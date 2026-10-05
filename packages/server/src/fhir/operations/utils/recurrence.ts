// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { RecurrenceTemplateExtensionURI, UCUM } from '@medplum/core';
import type { Extension } from '@medplum/fhirtypes';
import { Temporal } from 'temporal-polyfill';

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
