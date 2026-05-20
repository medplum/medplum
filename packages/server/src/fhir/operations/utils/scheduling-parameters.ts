// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, createReference, EMPTY, isDefined, OperationOutcomeError } from '@medplum/core';
import type {
  Extension,
  HealthcareService,
  HealthcareServiceAvailableTime,
  Period,
  Reference,
  Resource,
  Schedule,
} from '@medplum/fhirtypes';
import {
  assertExtensionBoolean,
  assertExtensionCode,
  assertExtensionDuration,
  assertExtensionReference,
  assertExtensionTime,
  getExtensions,
} from '../../../util/extension';
import type { WithPath } from '../../../util/withpath';
import { getPath, withPath } from '../../../util/withpath';

const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';

// The duration units we allow in the SchedulingParameters extension
// - "ms", "s" are not allowed due to being too fine grained (scheduling works at minute intervals only)
// - "mo", "a" are not allowed due to being ambiguous (months have different lengths, leap years have different length)
type DurationUnit = 'h' | 'min' | 'd' | 'wk';

// The SchedulingParameters extension constrains durations:
// - No comparator allowed; only exact durations supported
// - `value` is required
// - `unit` is required, and must be in a subset of values
type HardDuration = {
  value: number;
  unit: DurationUnit;
};

// Similar to a Temporal.PlainTime; represents a time without a date or time
// zone, as seen in the FHIR `time` type. Segments may be zero padded.
type WallClockTime = `${number}:${number}:${number}`;

// Nested extension types for `availability`, encoding the R5 `Availability` datatype
// in valid R4 extension form. Note: `daysOfWeek` repeats once per day value.
type AvailabilityR4AvailableTime = {
  url: 'availableTime';
  extension: (
    | { url: 'daysOfWeek'; valueCode: DayOfWeek }
    | { url: 'allDay'; valueBoolean: boolean }
    | { url: 'availableStartTime'; valueTime: WallClockTime }
    | { url: 'availableEndTime'; valueTime: WallClockTime }
  )[];
};

// Typed for completeness / future use; not yet processed by parseSchedulingParametersExtensions.
type AvailabilityR4NotAvailableTime = {
  url: 'notAvailableTime';
  extension: ({ url: 'description'; valueString: string } | { url: 'during'; valuePeriod: Period })[];
};

// The allowed nested extensions
export type SchedulingParametersExtensionExtension =
  | { url: 'bufferBefore'; valueDuration: HardDuration }
  | { url: 'bufferAfter'; valueDuration: HardDuration }
  | { url: 'alignmentInterval'; valueDuration: HardDuration }
  | { url: 'alignmentOffset'; valueDuration: HardDuration }
  | { url: 'duration'; valueDuration: HardDuration }
  | { url: 'service'; valueReference: Reference<HealthcareService> & { reference: string } }
  | { url: 'timezone'; valueCode: string }
  | {
      url: 'availability';
      extension: (AvailabilityR4AvailableTime | AvailabilityR4NotAvailableTime)[];
    };

export type SchedulingParametersExtension = {
  url: typeof SchedulingParametersURI;
  extension: SchedulingParametersExtensionExtension[];
};

type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type SchedulingParametersAvailability = {
  dayOfWeek: DayOfWeek[];
  availableStartTime: WallClockTime;
  availableEndTime: WallClockTime;
};

export type SchedulingParameters = {
  availability: SchedulingParametersAvailability[];
  bufferBefore: number; // minutes
  bufferAfter: number; // minutes
  alignmentInterval: number; // minutes
  alignmentOffset: number; // minutes
  duration: number; // minutes
  service: Reference<HealthcareService> & { reference: string };
  timezone?: string;
};

function isReferenceTo<T extends Resource>(reference: Reference<T>, resource: WithId<T>): boolean {
  if (!reference.reference) {
    return false;
  }
  const [refType, id] = reference.reference.split('/');
  return refType === resource.resourceType && id === resource.id;
}

function isDayOfWeek(s: string): s is DayOfWeek {
  return s === 'mon' || s === 'tue' || s === 'wed' || s === 'thu' || s === 'fri' || s === 'sat' || s === 'sun';
}

function durationToMinutes(extension: WithPath<Extension>): number {
  assertExtensionDuration(extension);

  const { value, unit } = extension.valueDuration;
  if (value === undefined) {
    throw new OperationOutcomeError(badRequest('Got duration without value', getPath(extension)));
  }
  switch (unit) {
    case 'wk':
      return value * 60 * 24 * 7;
    case 'd':
      return value * 60 * 24;
    case 'h':
      return value * 60;
    case 'min':
      return value;
    default:
      throw new OperationOutcomeError(badRequest(`Got unhandled duration unit "${unit}"`, getPath(extension)));
  }
}

function atMostOne<T extends object>(arr: WithPath<T>[], attribute: string): WithPath<T> | undefined {
  if (arr.length > 1) {
    throw new OperationOutcomeError(
      badRequest(
        `Scheduling parameter attribute '${attribute}' has too many values`,
        arr.map((obj) => getPath(obj))
      )
    );
  }
  return arr[0];
}

function atLeastOne<T>(arr: T[], attribute: string, options: { path?: string }): T[] {
  if (arr.length < 1) {
    throw new OperationOutcomeError(
      badRequest(`Required scheduling parameter attribute '${attribute}' is missing`, options.path)
    );
  }
  return arr;
}

function exactlyOne<T extends object>(arr: WithPath<T>[], attribute: string, options: { path?: string }): WithPath<T> {
  if (arr.length < 1) {
    throw new OperationOutcomeError(
      badRequest(`Required scheduling parameter attribute '${attribute}' is missing`, options.path)
    );
  }
  if (arr.length > 1) {
    throw new OperationOutcomeError(
      badRequest(
        `Scheduling parameter attribute '${attribute}' has too many values`,
        arr.map((obj) => getPath(obj))
      )
    );
  }
  return arr[0];
}

function exactlyZero(arr: WithPath<object>[], attribute: string, resourceType: string): void {
  if (arr.length > 0) {
    throw new OperationOutcomeError(
      badRequest(
        `Scheduling parameter attribute '${attribute}' is not allowed on ${resourceType}`,
        arr.map((obj) => getPath(obj))
      )
    );
  }
}

// slightly tricky: we test values by strict equality (`===`), so this doesn't
// work on complex types like `Availability`. We restrict this to a subset of
// keys from SchedulingParameters that we know contain primitive types.
function assertAllMatch(
  values: WithPath<SchedulingParameters>[],
  attribute: 'duration' | 'alignmentInterval' | 'alignmentOffset'
): void {
  if (values.length <= 1) {
    return;
  }
  const mismatched = values.find((value) => value[attribute] !== values[0][attribute]);
  if (mismatched) {
    throw new OperationOutcomeError(
      badRequest(`Scheduling parameters attribute '${attribute}' does not match`, [
        // We special case these a little bit - SchedulingParameters
        // attributes come from nested extensions, not direct attribute access
        `${getPath(values[0])}.extension('${attribute}')`,
        `${getPath(mismatched)}.extension('${attribute}')`,
      ])
    );
  }
}

export function chooseSchedulingParameterGroup(
  schedules: WithPath<WithId<Schedule>>[],
  healthcareService: WithPath<WithId<HealthcareService>>
): Map<WithPath<WithId<Schedule>>, WithPath<SchedulingParameters>> {
  const serviceParams = parseSchedulingParametersExtensions(healthcareService).at(0);
  const result = new Map<WithPath<WithId<Schedule>>, WithPath<SchedulingParameters>>();

  for (const schedule of schedules) {
    const params = parseSchedulingParametersExtensions(schedule).find((parameters) =>
      isReferenceTo(parameters.service, healthcareService)
    );

    // prefer schedule-specific overrides matching the requested service type,
    // fall back to service-defined parameters otherwise.
    const value = params ?? serviceParams;
    if (!value) {
      throw new OperationOutcomeError(
        badRequest('No SchedulingParameters found on Schedule or HealthcareService', [
          getPath(schedule),
          getPath(healthcareService),
        ])
      );
    }

    result.set(schedule, value);
  }

  return result;
}

export function extractCommonParameters(
  schedulingParameters: WithPath<SchedulingParameters>[]
): Pick<SchedulingParameters, 'duration' | 'alignmentInterval' | 'alignmentOffset'> {
  assertAllMatch(schedulingParameters, 'duration');
  assertAllMatch(schedulingParameters, 'alignmentInterval');
  assertAllMatch(schedulingParameters, 'alignmentOffset');

  return {
    duration: schedulingParameters[0].duration,
    alignmentInterval: schedulingParameters[0].alignmentInterval,
    alignmentOffset: schedulingParameters[0].alignmentOffset,
  };
}

/**
 * Given a Schedule and a HealthcareService, return the SchedulingParameters to
 * use.
 *
 * Priority order (highest to lowest):
 *  1. Entries from the Schedule matching the requested service-type
 *  2. Entries from HealthcareService
 *
 * @param schedule - Schedule resource
 * @param healthcareService - HealthcareService resource
 * @returns SchedulingParameters
 */
export function chooseSchedulingParameters(
  schedule: WithPath<Schedule>,
  healthcareService: WithPath<WithId<HealthcareService>>
): WithPath<SchedulingParameters> | undefined {
  const scheduleSchedulingParameters = parseSchedulingParametersExtensions(schedule);

  // Top priority: entries on the schedule pointing at this service
  const specificMatch = scheduleSchedulingParameters.find((schedulingParameters) =>
    isReferenceTo(schedulingParameters.service, healthcareService)
  );

  if (specificMatch) {
    return specificMatch;
  }

  // Return the first scheduling extension on HealthcareService
  const healthcareServiceSchedulingParameters = parseSchedulingParametersExtensions(healthcareService);
  if (healthcareServiceSchedulingParameters.length) {
    return healthcareServiceSchedulingParameters[0];
  }

  return undefined;
}

// Convert a single availability extension into SchedulingParametersAvailability entries.
// notAvailableTime sub-extensions are ignored for now.
function extractAvailabilityR4(ext: WithPath<Extension>): SchedulingParametersAvailability[] {
  // Intentionally ignored for now: any subextensions with URL `notAvailableTime`
  return getExtensions(ext, 'availableTime')
    .map((availTime) => {
      const dayOfWeek = getExtensions(availTime, 'daysOfWeek').map((e) => {
        assertExtensionCode(e);
        if (!isDayOfWeek(e.valueCode)) {
          throw new OperationOutcomeError(
            badRequest('Invalid SchedulingParameters.availability.availableTime.daysOfWeek entry', getPath(e))
          );
        }
        return e.valueCode;
      });

      const allDay = atMostOne(getExtensions(availTime, 'allDay'), 'availability.availableTime.allDay');
      if (allDay) {
        assertExtensionBoolean(allDay);
        if (allDay.valueBoolean) {
          // FHIR doesn't allow representing end-of-day as `24:00:00` in a time
          //
          // We follow a convention where when end <= start, we treat it as
          // belonging to the next day. In other words, this availability is
          // from the start of the given weekdays to the start of the
          // subsequent day.
          //
          // Note that we don't use a sentinel value like `23:59:59`, as we
          // don't want to introduce a 1sec gap in availability; some events
          // are scheduled to cross that boundary.
          return { dayOfWeek, availableStartTime: '00:00:00' as const, availableEndTime: '00:00:00' as const };
        }
      }

      const start = atMostOne(
        getExtensions(availTime, 'availableStartTime'),
        'availability.availableTime.availableStartTime'
      );
      const end = atMostOne(
        getExtensions(availTime, 'availableEndTime'),
        'availability.availableTime.availableEndTime'
      );
      if (start) {
        assertExtensionTime(start);
      }
      if (end) {
        assertExtensionTime(end);
      }

      if (start && end) {
        return {
          dayOfWeek,
          availableStartTime: start.valueTime as WallClockTime,
          availableEndTime: end.valueTime as WallClockTime,
        };
      }

      if (start) {
        throw new OperationOutcomeError(
          badRequest('availableTime has availableStartTime without availableEndTime', getPath(availTime))
        );
      }

      if (end) {
        throw new OperationOutcomeError(
          badRequest('availableTime has availableEndTime without availableStartTime', getPath(availTime))
        );
      }

      return undefined;
    })
    .filter(isDefined);
}

// Convert HealthcareService.availability entries into a format matching
// our extension.availability values
function extractAvailability(
  availableTime: HealthcareServiceAvailableTime
): SchedulingParametersAvailability | undefined {
  if (availableTime.allDay) {
    return {
      dayOfWeek: availableTime.daysOfWeek ?? [],
      availableStartTime: '00:00:00',
      availableEndTime: '00:00:00',
    };
  }

  if (availableTime.availableStartTime && availableTime.availableEndTime) {
    return {
      dayOfWeek: availableTime.daysOfWeek ?? [],
      availableStartTime: availableTime.availableStartTime as WallClockTime,
      availableEndTime: availableTime.availableEndTime as WallClockTime,
    };
  }

  return undefined;
}

/**
 * @param resource - A Schedule or HealthcareService to extract scheduling information from
 * @returns SchedulingParameters[] - An array of objects describing scheduling configuration
 */
export function parseSchedulingParametersExtensions(
  resource: WithPath<Schedule> | WithPath<HealthcareService>
): WithPath<SchedulingParameters>[] {
  const extensions = getExtensions(resource, SchedulingParametersURI);

  // Holds scheduling parameters extracted from attributes of the resource, to be merged into
  // each extension on the resource
  const resourceParameters: Partial<SchedulingParameters> = {};
  if (resource.resourceType === 'HealthcareService') {
    resourceParameters.availability = (resource.availableTime ?? EMPTY).map(extractAvailability).filter(isDefined);
  }

  return extensions.map((extension) => {
    const path = getPath(extension);
    const duration = exactlyOne(getExtensions(extension, 'duration'), 'duration', { path });

    // `availability` is required in Schedule, and not allowed in
    // HealthcareService (where we read from availableTime instead).
    const rawAvailability = getExtensions(extension, 'availability');
    if (resource.resourceType === 'Schedule') {
      atLeastOne(rawAvailability, 'availability', { path });
    } else {
      exactlyZero(rawAvailability, 'availability', resource.resourceType);
    }

    const availability = resourceParameters.availability ?? rawAvailability.flatMap(extractAvailabilityR4);

    const bufferBefore = atMostOne(getExtensions(extension, 'bufferBefore'), 'bufferBefore');
    const bufferAfter = atMostOne(getExtensions(extension, 'bufferAfter'), 'bufferAfter');
    const alignmentOffset = atMostOne(getExtensions(extension, 'alignmentOffset'), 'alignmentOffset');
    const rawAlignmentInterval = atMostOne(getExtensions(extension, 'alignmentInterval'), 'alignmentInterval');

    const timezone = atMostOne(getExtensions(extension, 'timezone'), 'timezone');
    if (timezone) {
      assertExtensionCode(timezone);
    }

    // `service` is expected in Schedule, not allowed in HealthcareService
    let service: Reference<HealthcareService> & { reference: string };
    const rawService = getExtensions(extension, 'service');
    if (resource.resourceType === 'HealthcareService') {
      exactlyZero(rawService, 'service', resource.resourceType);
      service = createReference(resource);
    } else {
      const serviceExt = exactlyOne(rawService, 'service', { path });
      assertExtensionReference<HealthcareService>(serviceExt, 'HealthcareService');
      service = serviceExt.valueReference;
    }

    // default alignmentInterval is "on the hour" (0)
    let alignmentInterval = rawAlignmentInterval ? durationToMinutes(rawAlignmentInterval) : 0;

    // Convert "on the hour" alignment from the structure (0) to one usable as a modulus (60)
    alignmentInterval = alignmentInterval === 0 ? 60 : alignmentInterval;

    return withPath(
      {
        service, // Reference to a HealthcareService these parameters are used for
        availability, // HealthcareService.availableTime or `availability` extension parameter

        // These attributes always come from the extension
        bufferBefore: bufferBefore ? durationToMinutes(bufferBefore) : 0,
        bufferAfter: bufferAfter ? durationToMinutes(bufferAfter) : 0,
        alignmentInterval,
        alignmentOffset: alignmentOffset ? durationToMinutes(alignmentOffset) : 0,
        duration: durationToMinutes(duration),
        timezone: timezone?.valueCode,
      },
      getPath(extension)
    );
  });
}
