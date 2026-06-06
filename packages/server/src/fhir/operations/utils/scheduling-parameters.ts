// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, createReference, isDefined, OperationOutcomeError } from '@medplum/core';
import type {
  Extension,
  HealthcareService,
  HealthcareServiceAvailableTime,
  Period,
  Reference,
  Resource,
  Schedule,
} from '@medplum/fhirtypes';
import { getLogger } from '../../../logger';
import {
  assertExtensionBoolean,
  assertExtensionCode,
  assertExtensionDuration,
  assertExtensionTime,
  getExtensions,
} from '../../../util/extension';
import type { WithPath } from '../../../util/withpath';
import { getPath } from '../../../util/withpath';

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

type BaseSchedulingParameters = {
  availability: SchedulingParametersAvailability[];
  bufferBefore: number; // minutes
  bufferAfter: number; // minutes
  alignmentInterval: number; // minutes
  alignmentOffset: number; // minutes
  service: Reference<HealthcareService> & { reference: string };
  timezone?: string;
};

type ServiceSchedulingParameters = BaseSchedulingParameters & {
  duration?: number; // minutes
};

export type SchedulingParameters = BaseSchedulingParameters & {
  duration: number; // minutes
};

// FHIR Convention: when end <= start, the end time is interpreted as being in
// the following day.  So 00:00:00 -> 00:00:00 on all 7 days means 24/7
// availability.
const alwaysAvailable: SchedulingParametersAvailability = {
  dayOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  availableStartTime: '00:00:00',
  availableEndTime: '00:00:00',
};

// Default values applied to HealthcareService SchedulingParameters (indirectly
// applied to Schedule SchedulingParameters which inherit from HealthcareService
// when not specified).
const SERVICE_DEFAULTS = Object.freeze({
  availability: [alwaysAvailable],
  alignmentInterval: 60,
  bufferBefore: 0,
  bufferAfter: 0,
  alignmentOffset: 0,
});

function isReferenceTo<T extends Resource>(reference: Reference<T> | undefined, resource: WithId<T>): boolean {
  if (!reference?.reference) {
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
  values: SchedulingParameters[],
  attribute: 'duration' | 'alignmentInterval' | 'alignmentOffset'
): void {
  if (values.length <= 1) {
    return;
  }
  const mismatched = values.find((value) => value[attribute] !== values[0][attribute]);
  if (mismatched) {
    throw new OperationOutcomeError(badRequest(`Scheduling parameters attribute '${attribute}' does not match`));
  }
}

export function chooseSchedulingParameterGroup(
  schedules: WithPath<WithId<Schedule>>[],
  healthcareService: WithPath<WithId<HealthcareService>>
): Map<WithPath<WithId<Schedule>>, SchedulingParameters> {
  const serviceParams = getHealthcareServiceSchedulingParameters(healthcareService);
  const result = new Map<WithPath<WithId<Schedule>>, SchedulingParameters>();

  for (const schedule of schedules) {
    const params = getScheduleSchedulingParameters(schedule, healthcareService, serviceParams);
    result.set(schedule, params);
  }

  return result;
}

export function extractCommonParameters(
  schedulingParameters: SchedulingParameters[]
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

// Get SchedulingParameters from a HealthcareService or throw
export function getHealthcareServiceSchedulingParameters(
  healthcareService: WithPath<HealthcareService>
): ServiceSchedulingParameters {
  const extensions = getExtensions(healthcareService, SchedulingParametersURI);
  if (extensions.length === 0) {
    // Q: Should this be an error?
    getLogger().warn('HealthcareService used for scheduling operation without SchedulingParameters extension');
    return {
      service: createReference(healthcareService),
      ...SERVICE_DEFAULTS,
    };
  }
  if (extensions.length > 1) {
    throw new OperationOutcomeError(
      badRequest('HealthcareService has too many scheduling parameters extensions', getPath(healthcareService))
    );
  }
  const extension = extensions[0];

  // Default: 24/7 availability
  let availability: SchedulingParametersAvailability[] = SERVICE_DEFAULTS.availability;
  // HealthcareService stores availability in a native field, read it from there.
  // Note: explicitly setting this field to an empty array makes this default to "never" available.
  if (healthcareService.availableTime) {
    availability = healthcareService.availableTime.map(extractAvailability).filter(isDefined);
  }

  // Q: Should `duration` be required on HealthcareService scheduling parameters?
  const durationExt = atMostOne(getExtensions(extension, 'duration'), 'duration');
  const bufferBeforeExt = atMostOne(getExtensions(extension, 'bufferBefore'), 'bufferBefore');
  const bufferAfterExt = atMostOne(getExtensions(extension, 'bufferAfter'), 'bufferAfter');
  const alignmentOffsetExt = atMostOne(getExtensions(extension, 'alignmentOffset'), 'alignmentOffset');
  const alignmentIntervalExt = atMostOne(getExtensions(extension, 'alignmentInterval'), 'alignmentInterval');
  const timezoneExt = atMostOne(getExtensions(extension, 'timezone'), 'timezone');

  // `service` sub-extension not allowed in HealthcareService; implied by resource
  exactlyZero(getExtensions(extension, 'service'), 'service', healthcareService.resourceType);

  // `availablity` sub-extension not allowed in HealthcareService; use `HealthcareService.availableTime` instead
  exactlyZero(getExtensions(extension, 'availability'), 'availability', healthcareService.resourceType);

  // Convert "on the hour" alignment from the stored representation (0) to value usable as a modulus (60)
  let alignmentInterval = alignmentIntervalExt
    ? durationToMinutes(alignmentIntervalExt)
    : SERVICE_DEFAULTS.alignmentInterval;
  alignmentInterval = alignmentInterval === 0 ? 60 : alignmentInterval;

  let timezone: string | undefined = undefined;
  if (timezoneExt) {
    assertExtensionCode(timezoneExt);
    timezone = timezoneExt.valueCode;
  }

  return {
    service: createReference(healthcareService),
    availability,
    alignmentInterval,
    duration: durationExt ? durationToMinutes(durationExt) : undefined,
    bufferBefore: bufferBeforeExt ? durationToMinutes(bufferBeforeExt) : SERVICE_DEFAULTS.bufferBefore,
    bufferAfter: bufferAfterExt ? durationToMinutes(bufferAfterExt) : SERVICE_DEFAULTS.bufferAfter,
    alignmentOffset: alignmentOffsetExt ? durationToMinutes(alignmentOffsetExt) : SERVICE_DEFAULTS.alignmentOffset,
    timezone,
  };
}

// Get SchedulingParameters for a Schedule/HealthcareService pairing.
export function getScheduleSchedulingParameters(
  schedule: WithPath<Schedule>,
  healthcareService: WithPath<WithId<HealthcareService>>,
  serviceParameters?: ServiceSchedulingParameters
): SchedulingParameters {
  // Parameters not set at the Schedule level get inherited from the Service level.
  // We accept parsed serviceParameters as an optional input so that multi-scheduling
  // endpoints can perform that parsing once and have the value be reused.
  const defaultParameters = serviceParameters ?? getHealthcareServiceSchedulingParameters(healthcareService);

  const extensions = getExtensions(schedule, SchedulingParametersURI).filter((extension) => {
    const serviceExt = getExtensions(extension, 'service');
    return serviceExt.some((ext) => isReferenceTo(ext.valueReference, healthcareService));
  });

  // If we didn't find an extension on the schedule for this service, use the
  // service-derived values directly.
  if (extensions.length === 0) {
    // The only value we don't have a default for is `duration`, ensure that it
    // was set in the service layer or fail.
    if (defaultParameters.duration === undefined) {
      throw new OperationOutcomeError(
        badRequest("Scheduling parameter attribute 'duration' is missing", [getPath(schedule)])
      );
    }
    return defaultParameters as SchedulingParameters;
  }

  // If there are multiple matches, the intention is unclear; abort.
  if (extensions.length > 1) {
    throw new OperationOutcomeError(
      badRequest('Schedule has too many scheduling parameters extensions', getPath(schedule))
    );
  }
  const extension = extensions[0];
  const durationExt = atMostOne(getExtensions(extension, 'duration'), 'duration');
  const bufferBeforeExt = atMostOne(getExtensions(extension, 'bufferBefore'), 'bufferBefore');
  const bufferAfterExt = atMostOne(getExtensions(extension, 'bufferAfter'), 'bufferAfter');
  const alignmentOffsetExt = atMostOne(getExtensions(extension, 'alignmentOffset'), 'alignmentOffset');
  const alignmentIntervalExt = atMostOne(getExtensions(extension, 'alignmentInterval'), 'alignmentInterval');
  const timezoneExt = atMostOne(getExtensions(extension, 'timezone'), 'timezone');

  let timezone: string | undefined = undefined;
  if (timezoneExt) {
    assertExtensionCode(timezoneExt);
    timezone = timezoneExt.valueCode;
  }

  // The "availability" sub-extension uses format that mirrors
  // `HealthcareService.availableTime` attribute.  When Medplum moves to FHIR
  // R5+, this can use the native `Availability` Metadata type instead.
  const availabilityExt = getExtensions(extension, 'availability');
  const availability = availabilityExt.length
    ? availabilityExt.flatMap(extractAvailabilityR4)
    : defaultParameters.availability;

  // Convert "on the hour" alignment from the stored representation (0) to
  // value usable as a modulus (60)
  let alignmentInterval = alignmentIntervalExt
    ? durationToMinutes(alignmentIntervalExt)
    : defaultParameters.alignmentInterval;
  alignmentInterval = alignmentInterval === 0 ? 60 : alignmentInterval;

  // Use extension from schedule when present, fall back to service-defined
  // value otherwise. Fail if no value set.
  const duration = durationExt ? durationToMinutes(durationExt) : defaultParameters.duration;
  if (duration === undefined) {
    throw new OperationOutcomeError(
      badRequest("Scheduling parameter attribute 'duration' is missing", [getPath(schedule)])
    );
  }

  return {
    service: defaultParameters.service,
    availability,
    alignmentInterval,
    duration,
    bufferBefore: bufferBeforeExt ? durationToMinutes(bufferBeforeExt) : defaultParameters.bufferBefore,
    bufferAfter: bufferAfterExt ? durationToMinutes(bufferAfterExt) : defaultParameters.bufferAfter,
    alignmentOffset: alignmentOffsetExt ? durationToMinutes(alignmentOffsetExt) : defaultParameters.alignmentOffset,
    timezone: timezone ?? defaultParameters.timezone,
  };
}
