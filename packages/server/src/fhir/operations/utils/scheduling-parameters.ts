// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ActivityDefinition, Coding, Duration, Schedule } from '@medplum/fhirtypes';
import { isDefined } from '../../../util/types';

const SchedulingParametersURI = 'http://medplum.com/fhir/StructureDefinition/scheduling-parameters';

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

// The allowed nested extensions
type SchedulingParametersExtensionExtension =
  | { url: 'bufferBefore'; valueDuration: HardDuration }
  | { url: 'bufferAfter'; valueDuration: HardDuration }
  | { url: 'alignmentInterval'; valueDuration: HardDuration }
  | { url: 'alignmentOffset'; valueDuration: HardDuration }
  | { url: 'duration'; valueDuration: HardDuration }
  | { url: 'serviceType'; valueCoding: Coding }
  | {
      url: 'availability';
      valueTiming: {
        repeat: {
          dayOfWeek: DayOfWeek[];
          timeOfDay: `${number}:${number}:${number}`[];
          duration: number;
          durationUnit: 'h' | 'min' | 'd' | 'wk';
        };
      };
    };

type SchedulingParametersExtension = {
  url: typeof SchedulingParametersURI;
  extension: SchedulingParametersExtensionExtension[];
};

type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type SchedulingParametersAvailability = {
  dayOfWeek: DayOfWeek[];
  timeOfDay: `${number}:${number}:${number}`[];
  duration: number; // minutes
};

type SchedulingParameters = {
  availability: SchedulingParametersAvailability[];
  bufferBefore: number; // minutes
  bufferAfter: number; // minutes
  alignmentInterval: number; // minutes
  alignmentOffset: number; // minutes
  duration: number; // minutes
  serviceTypes: string[]; // codes associated with this type
  wildcard: boolean; // true if this is describing "default" availability to use when no more specific service type matches
};

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
      throw new Error(`Got unhandled duration unit ${unit}`);
  }
}

/**
 * @param resource - A Schedule or ActivityDefinition to extract scheduling information from
 * @returns SchedulingParameters[] - An array of objects describing scheduling configuration
 */
export function parseSchedulingParametersExtensions(resource: Schedule | ActivityDefinition): SchedulingParameters[] {
  const extensions = (resource.extension ?? []).filter(
    (ext) => ext.url === SchedulingParametersURI
  ) as SchedulingParametersExtension[];
  return extensions.map((extension) => {
    const availability = extension.extension
      .filter((ext) => ext.url === 'availability')
      .map((ext) => ({
        dayOfWeek: ext.valueTiming.repeat.dayOfWeek,
        timeOfDay: ext.valueTiming.repeat.timeOfDay,
        duration: durationToMinutes({
          value: ext.valueTiming.repeat.duration,
          unit: ext.valueTiming.repeat.durationUnit,
        }),
      }));

    // required field
    const duration = extension.extension.find((ext) => ext.url === 'duration');
    if (!duration) {
      throw new Error('Got scheduling parameters extension without required `duration` field');
    }

    // Optional fields with at-most-one semantics
    const bufferBefore = extension.extension.find((ext) => ext.url === 'bufferBefore');
    const bufferAfter = extension.extension.find((ext) => ext.url === 'bufferAfter');
    const alignmentOffset = extension.extension.find((ext) => ext.url === 'alignmentOffset');
    const alignmentIntervalExt = extension.extension.find((ext) => ext.url === 'alignmentInterval');

    // default alignmentInterval is "on the hour" (0)
    let alignmentInterval = alignmentIntervalExt ? durationToMinutes(alignmentIntervalExt.valueDuration) : 0;

    // Convert "on the hour" alignment from the structure (0) to one usable as a modulus (60)
    alignmentInterval = alignmentInterval === 0 ? 60 : alignmentInterval;

    // Optional field with "zero, one, or many" semantics
    const serviceTypes = extension.extension
      .filter((ext) => ext.url === 'serviceType')
      .map((ext) => ext.valueCoding.code)
      .filter(isDefined);

    return {
      availability: availability,
      bufferBefore: bufferBefore ? durationToMinutes(bufferBefore.valueDuration) : 0,
      bufferAfter: bufferAfter ? durationToMinutes(bufferAfter.valueDuration) : 0,
      alignmentInterval,
      alignmentOffset: alignmentOffset ? durationToMinutes(alignmentOffset.valueDuration) : 0,
      duration: durationToMinutes(duration.valueDuration),
      serviceTypes,
      wildcard: serviceTypes.length === 0,
    };
  });
}
