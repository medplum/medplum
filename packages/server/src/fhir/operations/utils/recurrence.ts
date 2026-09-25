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
import type { WithPath } from '../../../util/withpath';
import { getPath, withPath } from '../../../util/withpath';

const IANA_TIMEZONES = 'https://www.iana.org/time-zones';

/** The most occurrences a weekly series may have, for `$find` to offer and `$book` to book. */
export const MAX_OCCURRENCE_COUNT = 6;

// Indexed by `Temporal.ZonedDateTime.dayOfWeek - 1`, and named for R5's `weeklyTemplate` elements.
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

/**
 * The weekday an instant falls on in `timezone`, named as in R5's `weeklyTemplate`.
 *
 * @param instant - The instant, as a FHIR instant or dateTime.
 * @param timezone - The IANA timezone.
 * @returns The weekday's name.
 */
export function weekdayOf(instant: string, timezone: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[
    Temporal.Instant.fromEpochMilliseconds(Date.parse(instant)).toZonedDateTimeISO(timezone).dayOfWeek - 1
  ];
}

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

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/**
 * Like `projectWeeksForward`, but cheap for many anchors in chronological order. A local day with
 * no DST transition, projected onto another, keeps every wall-clock time at one fixed shift, so the
 * shift is found once per day rather than once per anchor. Days that don't run 24 hours from
 * midnight, at either end, fall back to `projectWeeksForward`.
 *
 * @param weeksForward - How many weeks forward to project.
 * @param timezone - The IANA timezone whose wall-clock time is kept.
 * @returns A function projecting one anchor, as `projectWeeksForward` would.
 */
export function weekProjector(weeksForward: number, timezone: string): (anchor: Date) => Date | undefined {
  let day: { start: number; end: number; shift: number | undefined } | undefined;
  return (anchor) => {
    const instant = anchor.valueOf();
    if (!day || instant < day.start || instant >= day.end) {
      const start = Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(timezone).startOfDay();
      const end = start.add({ days: 1 }).startOfDay();
      const projected = start.add({ days: 7 * weeksForward });
      const wholeDays = [start, projected].every(
        (dayStart) =>
          dayStart.hour === 0 &&
          dayStart.minute === 0 &&
          dayStart.add({ days: 1 }).startOfDay().epochMilliseconds - dayStart.epochMilliseconds === DAY_MILLISECONDS
      );
      day = {
        start: start.epochMilliseconds,
        end: end.epochMilliseconds,
        shift: wholeDays ? projected.epochMilliseconds - start.epochMilliseconds : undefined,
      };
    }
    return day.shift === undefined
      ? projectWeeksForward(anchor, weeksForward, timezone)
      : new Date(instant + day.shift);
  };
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
 * R5's `recurrenceTemplate` for a weekly series, as the R4 cross-version extension.
 *
 * @param start - The first occurrence's start.
 * @param occurrenceCount - How many occurrences the series has.
 * @param timezone - The IANA timezone whose wall-clock time the series keeps, week to week.
 * @returns The `recurrenceTemplate` extension.
 */
export function weeklyTemplate(start: string, occurrenceCount: number, timezone: string): Extension {
  const weekday = weekdayOf(start, timezone);
  return {
    url: RecurrenceTemplateExtensionURI,
    extension: [
      { url: 'timezone', valueCodeableConcept: { coding: [{ system: IANA_TIMEZONES, code: timezone }] } },
      { url: 'recurrenceType', valueCodeableConcept: { coding: [{ system: UCUM, code: 'wk', display: 'week' }] } },
      { url: 'occurrenceCount', valuePositiveInt: occurrenceCount },
      {
        url: 'weeklyTemplate',
        extension: [
          { url: weekday, valueBoolean: true },
          { url: 'weekInterval', valuePositiveInt: 1 },
        ],
      },
    ],
  };
}

// Everything `tagWeeklySeries` and `linkToOriginatingAppointment` write.
const SERIES_EXTENSION_URLS = [
  RecurrenceIdExtensionURI,
  RecurrenceTemplateExtensionURI,
  OriginatingAppointmentExtensionURI,
];

/** A weekly series' `recurrenceTemplate`, as read from a proposed Appointment. */
export type WeeklyTemplate = {
  occurrenceCount: number;
  weekday: (typeof WEEKDAYS)[number];
  timezone: string;
};

// What `weeklyTemplate` writes. R5's other elements, such as `excludingDate`, change which weeks a
// series books, so a template carrying one is refused rather than booked as if it weren't there.
const TEMPLATE_ELEMENTS = ['timezone', 'recurrenceType', 'occurrenceCount', 'weeklyTemplate'] as const;
const WEEKLY_TEMPLATE_ELEMENTS = [...WEEKDAYS, 'weekInterval'] as const;

/**
 * Reads the `recurrenceTemplate` a proposed Appointment carries, refusing any that describes a
 * series other than the weekly ones `$find` offers.
 *
 * @param appointment - The proposed Appointment.
 * @returns The template, or undefined if the Appointment carries none.
 */
export function readWeeklyTemplate(appointment: WithPath<Appointment>): WithPath<WeeklyTemplate> | undefined {
  const extensions = appointment.extension ?? [];
  const indexes = extensions.flatMap((e, idx) => (e.url === RecurrenceTemplateExtensionURI ? [idx] : []));
  if (indexes.length === 0) {
    return undefined;
  }
  const path = `${getPath(appointment)}.extension[${indexes[0]}]`;
  const invalid = (message: string): OperationOutcomeError =>
    new OperationOutcomeError(badRequest(`Unsupported recurrenceTemplate: ${message}`, path));
  if (indexes.length > 1) {
    throw invalid('an Appointment may carry only one');
  }

  const elements = elementsByUrl(extensions[indexes[0]], TEMPLATE_ELEMENTS, invalid);

  const timezone = elements
    .get('timezone')
    ?.valueCodeableConcept?.coding?.find((coding) => coding.system === IANA_TIMEZONES)?.code;
  if (!timezone || !isTimezone(timezone)) {
    throw invalid('timezone must be an IANA timezone');
  }

  const recurrenceType = elements.get('recurrenceType')?.valueCodeableConcept?.coding;
  if (!recurrenceType?.some((coding) => coding.system === UCUM && coding.code === 'wk')) {
    throw invalid('recurrenceType must be weekly');
  }

  const occurrenceCount = elements.get('occurrenceCount')?.valuePositiveInt;
  if (
    occurrenceCount === undefined ||
    !Number.isInteger(occurrenceCount) ||
    occurrenceCount < 2 ||
    occurrenceCount > MAX_OCCURRENCE_COUNT
  ) {
    throw invalid(`occurrenceCount must be an integer between 2 and ${MAX_OCCURRENCE_COUNT}`);
  }

  const weekly = elements.get('weeklyTemplate');
  if (!weekly) {
    throw invalid('weeklyTemplate is required');
  }
  const weeklyElements = elementsByUrl(weekly, WEEKLY_TEMPLATE_ELEMENTS, invalid);
  const weekInterval = weeklyElements.get('weekInterval');
  if (weekInterval && weekInterval.valuePositiveInt !== 1) {
    throw invalid('weekInterval must be 1');
  }
  const weekdays = WEEKDAYS.filter((weekday) => weeklyElements.get(weekday)?.valueBoolean === true);
  if (weekdays.length !== 1) {
    throw invalid('weeklyTemplate must name exactly one weekday');
  }

  return withPath({ occurrenceCount, weekday: weekdays[0], timezone }, path);
}

/**
 * Proposes every occurrence of a weekly series from its first. Each later occurrence starts the
 * same local time in the template's timezone, whole weeks later, and every Slot the first contains,
 * buffers included, keeps its offset from the start.
 *
 * The template's timezone is trusted here, before any schedule is read, so the caller must check
 * that it is the schedules' own, and that the template's weekday is the first occurrence's in it.
 *
 * @param first - The series' first occurrence, as proposed by `$find`.
 * @param template - The template `first` carries.
 * @returns Every occurrence in order, starting with `first`; each has `first`'s path.
 */
export function expandWeeklySeries(
  first: WithPath<Appointment>,
  template: WithPath<WeeklyTemplate>
): WithPath<Appointment>[] {
  const path = getPath(first);
  if (!first.start || Number.isNaN(Date.parse(first.start))) {
    throw new OperationOutcomeError(badRequest('A recurring series must have a start', `${path}.start`));
  }
  const start = new Date(first.start);
  const occurrences = [first];
  for (let weeksForward = 1; weeksForward < template.occurrenceCount; weeksForward++) {
    const projected = projectWeeksForward(start, weeksForward, template.timezone);
    if (!projected) {
      throw new OperationOutcomeError(
        badRequest(
          `Occurrence ${weeksForward + 1} of the series falls at a local time that doesn't exist in ${template.timezone}`,
          path
        )
      );
    }
    const shift = (instant: string): string => {
      const ms = Date.parse(instant);
      return Number.isNaN(ms) ? instant : new Date(ms + projected.valueOf() - start.valueOf()).toISOString();
    };
    const occurrence: Appointment = {
      ...first,
      start: shift(first.start),
      end: first.end && shift(first.end),
      contained: first.contained?.map((resource) =>
        resource.resourceType === 'Slot'
          ? { ...resource, start: shift(resource.start), end: shift(resource.end) }
          : resource
      ),
    };
    occurrences.push(withPath(occurrence, path));
  }
  return occurrences;
}

// An extension's sub-extensions by url, refusing any url not in `allowed`, or repeated.
function elementsByUrl(
  extension: Extension,
  allowed: readonly string[],
  invalid: (message: string) => Error
): Map<string, Extension> {
  const elements = new Map<string, Extension>();
  for (const element of extension.extension ?? []) {
    if (!allowed.includes(element.url)) {
      throw invalid(`${element.url} is not supported`);
    }
    if (elements.has(element.url)) {
      throw invalid(`${element.url} may appear only once`);
    }
    elements.set(element.url, element);
  }
  return elements;
}

function isTimezone(timezone: string): boolean {
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timezone);
    return true;
  } catch {
    return false;
  }
}

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
  const template = weeklyTemplate(occurrences[0].start as string, occurrences.length, timezone);

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
