// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ActivityDefinition, CodeableConcept, Duration, Schedule } from '@medplum/fhirtypes';

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

// The allowed nested extensions
type SchedulingParametersExtensionExtension =
  | { url: 'bufferBefore'; valueDuration: HardDuration }
  | { url: 'bufferAfter'; valueDuration: HardDuration }
  | { url: 'alignmentInterval'; valueDuration: HardDuration }
  | { url: 'alignmentOffset'; valueDuration: HardDuration }
  | { url: 'duration'; valueDuration: HardDuration }
  | { url: 'serviceType'; valueCodeableConcept: CodeableConcept }
  | { url: 'timezone'; valueCode: string }
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

export type SchedulingParameters = {
  availability: SchedulingParametersAvailability[];
  bufferBefore: number; // minutes
  bufferAfter: number; // minutes
  alignmentInterval: number; // minutes
  alignmentOffset: number; // minutes
  duration: number; // minutes
  serviceType: CodeableConcept[]; // codes that may be booked into this availability
  timezone?: string;
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
      throw new Error(`Got unhandled unit "${unit}"`);
  }
}

function atMostOne<T>(arr: T[], attribute: string): T | undefined {
  if (arr.length > 1) {
    throw new Error(`Scheduling parameter attribute '${attribute}' has too many values`);
  }
  return arr[0];
}

function atLeastOne<T>(arr: T[], attribute: string): T[] {
  if (arr.length < 1) {
    throw new Error(`Required scheduling parameter attribute '${attribute}' is missing`);
  }
  return arr;
}

function exactlyOne<T>(arr: T[], attribute: string): T {
  if (arr.length < 1) {
    throw new Error(`Required scheduling parameter attribute '${attribute}' is missing`);
  }
  if (arr.length > 1) {
    throw new Error(`Scheduling parameter attribute '${attribute}' has too many values`);
  }
  return arr[0];
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
    const duration = exactlyOne(
      extension.extension.filter((ext) => ext.url === 'duration'),
      'duration'
    );
    const rawAvailability = atLeastOne(
      extension.extension.filter((ext) => ext.url === 'availability'),
      'availability'
    );
    const bufferBefore = atMostOne(
      extension.extension.filter((ext) => ext.url === 'bufferBefore'),
      'bufferBefore'
    );
    const bufferAfter = atMostOne(
      extension.extension.filter((ext) => ext.url === 'bufferAfter'),
      'bufferAfter'
    );
    const alignmentOffset = atMostOne(
      extension.extension.filter((ext) => ext.url === 'alignmentOffset'),
      'alignmentOffset'
    );
    const rawAlignmentInterval = atMostOne(
      extension.extension.filter((ext) => ext.url === 'alignmentInterval'),
      'alignmentInterval'
    );
    const timezone = atMostOne(
      extension.extension.filter((ext) => ext.url === 'timezone'),
      'timezone'
    );

    // serviceType has cardinality 0..*
    const serviceType = extension.extension
      .filter((ext) => ext.url === 'serviceType')
      .map((ext) => ext.valueCodeableConcept);

    const availability = rawAvailability.map((ext) => ({
      dayOfWeek: ext.valueTiming.repeat.dayOfWeek,
      timeOfDay: ext.valueTiming.repeat.timeOfDay,
      duration: durationToMinutes({
        value: ext.valueTiming.repeat.duration,
        unit: ext.valueTiming.repeat.durationUnit,
      }),
    }));

    // default alignmentInterval is "on the hour" (0)
    let alignmentInterval = rawAlignmentInterval ? durationToMinutes(rawAlignmentInterval.valueDuration) : 0;

    // Convert "on the hour" alignment from the structure (0) to one usable as a modulus (60)
    alignmentInterval = alignmentInterval === 0 ? 60 : alignmentInterval;

    return {
      availability: availability,
      bufferBefore: bufferBefore ? durationToMinutes(bufferBefore.valueDuration) : 0,
      bufferAfter: bufferAfter ? durationToMinutes(bufferAfter.valueDuration) : 0,
      alignmentInterval,
      alignmentOffset: alignmentOffset ? durationToMinutes(alignmentOffset.valueDuration) : 0,
      duration: durationToMinutes(duration.valueDuration),
      serviceType,
      timezone: timezone?.valueCode,
    };
  });
}
