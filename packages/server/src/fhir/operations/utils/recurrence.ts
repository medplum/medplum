// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  OperationOutcomeError,
  OriginatingAppointmentExtensionURI,
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  RecurringAppointmentSeriesIdentifierSystem,
  UCUM,
} from '@medplum/core';
import type { Appointment, Extension } from '@medplum/fhirtypes';
import { Temporal } from 'temporal-polyfill';
import type { LayeredDict } from '../../../util/layereddict';

const IANA_TIMEZONES = 'https://www.iana.org/time-zones';

// Indexed by `Temporal.ZonedDateTime.dayOfWeek - 1`, and named for R5's `weeklyTemplate` elements.
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

// Projects an instant forward by whole weeks, keeping its wall-clock time in `timezone` across
// DST transitions. Undefined if that wall-clock time doesn't exist that week, as in a DST gap.
export function projectWeeksForward(anchor: Date, weeksForward: number, timezone: string): Date | undefined {
  const local = Temporal.Instant.fromEpochMilliseconds(anchor.valueOf()).toZonedDateTimeISO(timezone);
  const projected = local.add({ days: 7 * weeksForward });
  if (!projected.toPlainTime().equals(local.toPlainTime())) {
    return undefined;
  }
  return new Date(projected.epochMilliseconds);
}

/**
 * The timezone a weekly series keeps its local time in: the one its schedules' availability is
 * defined in, which every schedule must share.
 *
 * @param parameters - The scheduling parameters of every schedule in the series.
 * @returns The IANA timezone shared by every schedule.
 */
export function seriesTimezone(parameters: LayeredDict<{ timezone: string }>[]): string {
  const timezone = parameters[0].get('timezone');
  if (parameters.some((other) => other.get('timezone') !== timezone)) {
    throw new OperationOutcomeError(badRequest('Every schedule in a recurring series must share one timezone'));
  }
  return timezone;
}

/**
 * Whether a series' start times fall exactly one week apart, at the same local time in `timezone`.
 *
 * @param starts - Each occurrence's start, in series order.
 * @param timezone - The IANA timezone whose wall-clock time the series keeps.
 * @returns True for a weekly series; false if any start is missing or out of step.
 */
export function recursWeekly(starts: (string | undefined)[], timezone: string): boolean {
  const [first, ...rest] = starts.map((start) => (start ? Date.parse(start) : Number.NaN));
  if (Number.isNaN(first)) {
    return false;
  }
  return rest.every((start, idx) => start === projectWeeksForward(new Date(first), idx + 1, timezone)?.valueOf());
}

// Everything `tagWeeklySeries` and `linkToOriginatingAppointment` write.
const SERIES_EXTENSION_URLS = [
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  OriginatingAppointmentExtensionURI,
];

/**
 * Tags the occurrences of a booked weekly series, in order, replacing any series tags they
 * already carry. Only the first gets the `recurrenceTemplate`.
 *
 * @param occurrences - The series, in order.
 * @param seriesId - The identifier shared by every occurrence.
 * @param timezone - The IANA timezone whose wall-clock time the series keeps, week to week.
 * @returns The tagged occurrences.
 */
export function tagWeeklySeries(occurrences: Appointment[], seriesId: string, timezone: string): Appointment[] {
  const weekday =
    WEEKDAYS[Temporal.Instant.from(occurrences[0].start as string).toZonedDateTimeISO(timezone).dayOfWeek - 1];
  const template: Extension = {
    url: RecurrenceTemplateExtensionURI,
    extension: [
      { url: 'timezone', valueCodeableConcept: { coding: [{ system: IANA_TIMEZONES, code: timezone }] } },
      { url: 'recurrenceType', valueCodeableConcept: { coding: [{ system: UCUM, code: 'wk', display: 'week' }] } },
      { url: 'occurrenceCount', valuePositiveInt: occurrences.length },
      {
        url: 'weeklyTemplate',
        extension: [
          { url: weekday, valueBoolean: true },
          { url: 'weekInterval', valuePositiveInt: 1 },
        ],
      },
    ],
  };

  return occurrences.map((appointment, idx) => ({
    ...appointment,
    identifier: [
      ...(appointment.identifier ?? []).filter((i) => i.system !== RecurringAppointmentSeriesIdentifierSystem),
      { system: RecurringAppointmentSeriesIdentifierSystem, value: seriesId },
    ],
    extension: [
      ...(appointment.extension ?? []).filter((e) => !SERIES_EXTENSION_URLS.includes(e.url)),
      { url: RecurrenceIdExtensionURI, valuePositiveInt: idx + 1 },
      ...(idx === 0 ? [template] : []),
    ],
  }));
}

/**
 * Links a later occurrence back to the first occurrence of its series, which carries the template.
 *
 * @param appointment - The later occurrence.
 * @param originating - The first occurrence, once it has been created.
 * @returns The linked occurrence.
 */
export function linkToOriginatingAppointment(appointment: Appointment, originating: WithId<Appointment>): Appointment {
  return {
    ...appointment,
    extension: [
      ...(appointment.extension ?? []),
      { url: OriginatingAppointmentExtensionURI, valueReference: createReference(originating) },
    ],
  };
}
