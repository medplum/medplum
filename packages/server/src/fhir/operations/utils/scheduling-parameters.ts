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
import { LayeredDict } from '../../../util/layereddict';
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
  values: LayeredDict<SchedulingParameters>[],
  attribute: 'duration' | 'alignmentInterval' | 'alignmentOffset'
): void {
  if (values.length <= 1) {
    return;
  }
  const mismatched = values.find((value) => value.get(attribute) !== values[0].get(attribute));
  if (mismatched) {
    throw new OperationOutcomeError(
      badRequest(`Scheduling parameters attribute '${attribute}' does not match`, [
        values[0].getPath(attribute),
        mismatched.getPath(attribute),
      ])
    );
  }
}

export function extractCommonParameters(
  schedulingParameters: LayeredDict<SchedulingParameters>[]
): Pick<SchedulingParameters, 'duration' | 'alignmentInterval' | 'alignmentOffset'> {
  assertAllMatch(schedulingParameters, 'duration');
  assertAllMatch(schedulingParameters, 'alignmentInterval');
  assertAllMatch(schedulingParameters, 'alignmentOffset');

  return {
    duration: schedulingParameters[0].get('duration'),
    alignmentInterval: schedulingParameters[0].get('alignmentInterval'),
    alignmentOffset: schedulingParameters[0].get('alignmentOffset'),
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

// In the SchedulingParameters extension, `alignmentInterval: 0` means "align
// to the start of the hour". In our in-memory representation, we want to
// convert this to a value that can be used as a modulus.
function toHourlyModulus(value: number): number {
  if (value === 0) {
    return 60;
  }
  return value;
}

// Get SchedulingParameters from a HealthcareService or throw
export function getHealthcareServiceSchedulingParameters(
  healthcareService: WithPath<HealthcareService>
): LayeredDict<ServiceSchedulingParameters> {
  const defaultsLayer = withPath(
    {
      service: createReference(healthcareService),
      ...SERVICE_DEFAULTS,
    },
    getPath(healthcareService)
  );

  let result: LayeredDict<ServiceSchedulingParameters> = LayeredDict.from(defaultsLayer);

  // HealthcareService stores availability in a native field, read it from there.
  // Note: explicitly setting this field to an empty array makes this default to "never" available.
  if (healthcareService.availableTime) {
    result = result.addLayer(
      withPath(
        {
          availability: healthcareService.availableTime.map(extractAvailability).filter(isDefined),
        },
        getPath(healthcareService)
      )
    );
  }

  const extensions = getExtensions(healthcareService, SchedulingParametersURI);
  if (extensions.length === 0) {
    // Proposal: make this an error before scheduling GA launch. Consider
    // making `duration` a required field at the same time. This would simplify
    // the type logic (`duration` could always be guaranteed, removing the
    // difference between ServiceSchedulingParameters and SchedulingParameters.
    getLogger().warn('HealthcareService used for scheduling operation without SchedulingParameters extension');
    return result;
  }
  if (extensions.length > 1) {
    throw new OperationOutcomeError(
      badRequest('HealthcareService has too many scheduling parameters extensions', getPath(healthcareService))
    );
  }
  const extension = extensions[0];

  const durationExt = atMostOne(getExtensions(extension, 'duration'), 'duration');
  const bufferBeforeExt = atMostOne(getExtensions(extension, 'bufferBefore'), 'bufferBefore');
  const bufferAfterExt = atMostOne(getExtensions(extension, 'bufferAfter'), 'bufferAfter');
  const alignmentOffsetExt = atMostOne(getExtensions(extension, 'alignmentOffset'), 'alignmentOffset');
  const alignmentIntervalExt = atMostOne(getExtensions(extension, 'alignmentInterval'), 'alignmentInterval');
  const timezoneExt = atMostOne(getExtensions(extension, 'timezone'), 'timezone');

  // `service` sub-extension not allowed in HealthcareService; implied by resource
  exactlyZero(getExtensions(extension, 'service'), 'service', healthcareService.resourceType);

  // `availability` sub-extension not allowed in HealthcareService; use `HealthcareService.availableTime` instead
  exactlyZero(getExtensions(extension, 'availability'), 'availability', healthcareService.resourceType);

  if (timezoneExt) {
    assertExtensionCode(timezoneExt);
  }

  return result.patchLayer(
    withPath(
      {
        ...(durationExt && { duration: durationToMinutes(durationExt) }),
        ...(bufferBeforeExt && { bufferBefore: durationToMinutes(bufferBeforeExt) }),
        ...(bufferAfterExt && { bufferAfter: durationToMinutes(bufferAfterExt) }),
        ...(alignmentOffsetExt && { alignmentOffset: durationToMinutes(alignmentOffsetExt) }),
        ...(alignmentIntervalExt && { alignmentInterval: toHourlyModulus(durationToMinutes(alignmentIntervalExt)) }),
        ...(timezoneExt && { timezone: timezoneExt.valueCode }),
      },
      getPath(extension)
    )
  );
}

// Get SchedulingParameters for a Schedule/HealthcareService pairing.
export function getScheduleSchedulingParameters(
  schedule: WithPath<Schedule>,
  healthcareService: WithPath<WithId<HealthcareService>>,
  serviceParameters?: LayeredDict<ServiceSchedulingParameters>
): LayeredDict<SchedulingParameters> {
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
    // The only value we don't have a default for is `duration`, ensure it was
    // set in the service layer or fail.
    return defaultParameters.refine((p): asserts p is SchedulingParameters => {
      if (p.duration === undefined) {
        throw new OperationOutcomeError(
          badRequest("Scheduling parameter attribute 'duration' is missing", [
            getPath(healthcareService),
            getPath(schedule),
          ])
        );
      }
    });
  }

  // If there are multiple matching extensions, the intention is unclear; abort.
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

  if (timezoneExt) {
    assertExtensionCode(timezoneExt);
  }

  // The "availability" sub-extension uses format that mirrors
  // `HealthcareService.availableTime` attribute. When Medplum moves to FHIR
  // R5+, this can use the native `Availability` Metadata type instead.
  const availabilityExt = getExtensions(extension, 'availability');

  const layer = withPath(
    {
      ...(availabilityExt.length && { availability: availabilityExt.flatMap(extractAvailabilityR4) }),
      ...(durationExt && { duration: durationToMinutes(durationExt) }),
      ...(bufferBeforeExt && { bufferBefore: durationToMinutes(bufferBeforeExt) }),
      ...(bufferAfterExt && { bufferAfter: durationToMinutes(bufferAfterExt) }),
      ...(alignmentOffsetExt && { alignmentOffset: durationToMinutes(alignmentOffsetExt) }),
      ...(alignmentIntervalExt && { alignmentInterval: toHourlyModulus(durationToMinutes(alignmentIntervalExt)) }),
      ...(timezoneExt && { timezone: timezoneExt.valueCode }),
    },
    getPath(extension)
  );

  return defaultParameters.patchLayer(layer).refine((p): asserts p is SchedulingParameters => {
    if (p.duration === undefined) {
      throw new OperationOutcomeError(
        badRequest("Scheduling parameter attribute 'duration' is missing", [getPath(schedule)])
      );
    }
  });
}
