// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { EMPTY, createReference, isDefined } from '@medplum/core';
import type {
  Duration,
  HealthcareService,
  HealthcareServiceAvailableTime,
  Period,
  Reference,
  Resource,
  Schedule,
} from '@medplum/fhirtypes';

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

function durationToMinutes(duration: Duration): number {
  const { value, unit } = duration;
  if (value === undefined) {
    throw new Error('Got duration without value');
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
      throw new Error(`Got unhandled unit "${unit}"`);
  }
}

function atMostOne<T>(arr: T[], attribute: string, _resourceType: string): T | undefined {
  if (arr.length > 1) {
    throw new Error(`Scheduling parameter attribute '${attribute}' has too many values`);
  }
  return arr[0];
}

function atLeastOne<T>(arr: T[], attribute: string, _resourceType: string): T[] {
  if (arr.length < 1) {
    throw new Error(`Required scheduling parameter attribute '${attribute}' is missing`);
  }
  return arr;
}

function exactlyOne<T>(arr: T[], attribute: string, _resourceType: string): T {
  if (arr.length < 1) {
    throw new Error(`Required scheduling parameter attribute '${attribute}' is missing`);
  }
  if (arr.length > 1) {
    throw new Error(`Scheduling parameter attribute '${attribute}' has too many values`);
  }
  return arr[0];
}

function exactlyZero(arr: unknown[], attribute: string, resourceType: string): void {
  if (arr.length > 0) {
    throw new Error(`Scheduling parameter attribute '${attribute}' is not allowed on ${resourceType}`);
  }
}

function allMatch<T>(values: T[]): boolean {
  const first = values[0];
  return values.every((value) => value === first);
}

export function chooseSchedulingParameterGroup(
  schedules: Schedule[],
  healthcareService: WithId<HealthcareService>
): Map<Schedule, SchedulingParameters | undefined> {
  const serviceParams = parseSchedulingParametersExtensions(healthcareService).at(0);
  const result = new Map<Schedule, SchedulingParameters | undefined>();

  for (const schedule of schedules) {
    const params = parseSchedulingParametersExtensions(schedule).find((parameters) =>
      isReferenceTo(parameters.service, healthcareService)
    );

    // prefer schedule-specific overrides matching the requested service type,
    // fall back to service-defined parameters otherwise.
    result.set(schedule, params ?? serviceParams);
  }

  return result;
}

export function extractCommonParameters(
  schedulingParameters: SchedulingParameters[]
): Pick<SchedulingParameters, 'duration' | 'alignmentInterval' | 'alignmentOffset'> {
  if (!allMatch(schedulingParameters.map((x) => x.duration))) {
    throw new Error('Scheduling parameters `duration` does not match');
  }
  if (!allMatch(schedulingParameters.map((x) => x.alignmentInterval))) {
    throw new Error('Scheduling parameters `alignmentInterval` does not match');
  }
  if (!allMatch(schedulingParameters.map((x) => x.alignmentOffset))) {
    throw new Error('Scheduling parameters `alignmentOffset` does not match');
  }

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
  schedule: Schedule,
  healthcareService: WithId<HealthcareService>
): SchedulingParameters | undefined {
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
function extractAvailabilityR4(ext: {
  url: 'availability';
  extension: (AvailabilityR4AvailableTime | AvailabilityR4NotAvailableTime)[];
}): SchedulingParametersAvailability[] {
  return ext.extension
    .filter((sub) => sub.url === 'availableTime')
    .map((availTime) => {
      const dayOfWeek = availTime.extension.filter((e) => e.url === 'daysOfWeek').map((e) => e.valueCode);

      const allDay = availTime.extension.find((e) => e.url === 'allDay')?.valueBoolean;
      if (allDay) {
        // FHIR doesn't allow representing end-of-day as `24:00:00` in a time
        //
        // We follow a convention where when end <= start, we treat it as
        // belonging to the next day. In other words, this availability is from
        // the start of the given weekdays to the start of the subsequent day.
        //
        // Note that we don't use a sentinel value like `23:59:59`, as we don't
        // want to introduce a 1sec gap in availability; some events are
        // scheduled to cross that boundary.
        return { dayOfWeek, availableStartTime: '00:00:00' as const, availableEndTime: '00:00:00' as const };
      }

      const start = availTime.extension.find((e) => e.url === 'availableStartTime')?.valueTime;
      const end = availTime.extension.find((e) => e.url === 'availableEndTime')?.valueTime;
      if (start && end) {
        return { dayOfWeek, availableStartTime: start, availableEndTime: end };
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
export function parseSchedulingParametersExtensions(resource: Schedule | HealthcareService): SchedulingParameters[] {
  const extensions = (resource.extension ?? []).filter(
    (ext) => ext.url === SchedulingParametersURI
  ) as SchedulingParametersExtension[];

  // Holds scheduling parameters extracted from attributes of the resource, to be merged into
  // each extension on the resource
  const resourceParameters: Partial<SchedulingParameters> = {};
  if (resource.resourceType === 'HealthcareService') {
    resourceParameters.service = createReference(resource);
    resourceParameters.availability = (resource.availableTime ?? EMPTY).map(extractAvailability).filter(isDefined);
  }

  return extensions.map((extension) => {
    const duration = exactlyOne(
      extension.extension.filter((ext) => ext.url === 'duration'),
      'duration',
      resource.resourceType
    );

    // `availability` is required in Schedule, and not allowed in
    // HealthcareService (where we read from availableTime instead).
    const rawAvailability = extension.extension.filter((ext) => ext.url === 'availability');
    if (resource.resourceType === 'Schedule') {
      atLeastOne(rawAvailability, 'availability', resource.resourceType);
    } else {
      exactlyZero(rawAvailability, 'availability', resource.resourceType);
    }

    const availability = resourceParameters.availability ?? rawAvailability.flatMap(extractAvailabilityR4);

    const bufferBefore = atMostOne(
      extension.extension.filter((ext) => ext.url === 'bufferBefore'),
      'bufferBefore',
      resource.resourceType
    );
    const bufferAfter = atMostOne(
      extension.extension.filter((ext) => ext.url === 'bufferAfter'),
      'bufferAfter',
      resource.resourceType
    );
    const alignmentOffset = atMostOne(
      extension.extension.filter((ext) => ext.url === 'alignmentOffset'),
      'alignmentOffset',
      resource.resourceType
    );
    const rawAlignmentInterval = atMostOne(
      extension.extension.filter((ext) => ext.url === 'alignmentInterval'),
      'alignmentInterval',
      resource.resourceType
    );
    const timezone = atMostOne(
      extension.extension.filter((ext) => ext.url === 'timezone'),
      'timezone',
      resource.resourceType
    );

    // `service` is expected in Schedule, not allowed in HealthcareService
    const rawService = extension.extension.filter((ext) => ext.url === 'service');
    if (resource.resourceType === 'HealthcareService') {
      exactlyZero(rawService, 'service', resource.resourceType);
    }
    const service =
      resourceParameters.service ?? exactlyOne(rawService, 'service', resource.resourceType).valueReference;

    // default alignmentInterval is "on the hour" (0)
    let alignmentInterval = rawAlignmentInterval ? durationToMinutes(rawAlignmentInterval.valueDuration) : 0;

    // Convert "on the hour" alignment from the structure (0) to one usable as a modulus (60)
    alignmentInterval = alignmentInterval === 0 ? 60 : alignmentInterval;

    return {
      service, // Reference to a HealthcareService these parameters are used for
      availability, // HealthcareService.availableTime or `availability` extension parameter

      // These attributes always come from the extension
      bufferBefore: bufferBefore ? durationToMinutes(bufferBefore.valueDuration) : 0,
      bufferAfter: bufferAfter ? durationToMinutes(bufferAfter.valueDuration) : 0,
      alignmentInterval,
      alignmentOffset: alignmentOffset ? durationToMinutes(alignmentOffset.valueDuration) : 0,
      duration: durationToMinutes(duration.valueDuration),
      timezone: timezone?.valueCode,
    };
  });
}
