// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * Reads and writes the scheduling parameters as a flat object of minutes and timezone codes, the shape a
 * form binds to rather than the shape they are stored in.
 *
 * `@medplum/core` keeps the generic SchedulingParameters plumbing this is built on, which is untyped by
 * design: a parameter is any sub-extension. The typed flat layer lives here instead, next to the forms
 * that edit it, because this package is still alpha and can change it freely.
 */
import type { WithId } from '@medplum/core';
import {
  assertNever,
  clearHealthcareServiceSchedulingParameter,
  clearScheduleSchedulingParameter,
  getHealthcareServiceSchedulingParameters,
  getScheduleSchedulingParameters,
  isDefined,
  minutesToSchedulingDuration,
  schedulingDurationToMinutes,
  setHealthcareServiceSchedulingParameter,
  setScheduleSchedulingParameter,
} from '@medplum/core';
import type { Extension, HealthcareService, Schedule } from '@medplum/fhirtypes';

/**
 * The flat scheduling parameters, in minutes for every duration, and undefined for one the resource does
 * not set. Scheduling defaults an unset parameter rather than refusing to schedule without it: no buffers,
 * an hourly alignment grid anchored to UTC, and one appointment per time. `duration` is the exception, and
 * a visit type that leaves it unset is bookable only on calendars that set it themselves.
 *
 * `availability` is absent by design: it nests rather than carrying a single `value[x]`, a service holds it
 * in `HealthcareService.availableTime`, and `./availability` covers it instead.
 */
export interface SchedulingParameterValues {
  /** How long the appointment runs. */
  duration?: number;
  /** Prep time held before the appointment, reserved with a Slot of its own. */
  bufferBefore?: number;
  /** Cleanup or turnover time held after the appointment, reserved with a Slot of its own. */
  bufferAfter?: number;
  /** The grid start times must land on. Scheduling reads an unset or zero interval as hourly. */
  alignmentInterval?: number;
  /** Shifts the alignment grid, and is taken modulo the interval. */
  alignmentOffset?: number;
  /** How many appointments may be held at the same start time. */
  slotCapacity?: number;
  /** IANA timezone the availability hours are read in. */
  timezone?: string;
  /** IANA timezone whose local midnight anchors the alignment grid. */
  alignmentTimezone?: string;
}

const DURATION_PARAMETERS = [
  'duration',
  'bufferBefore',
  'bufferAfter',
  'alignmentInterval',
  'alignmentOffset',
] as const satisfies (keyof SchedulingParameterValues)[];

/** The parameters carrying an IANA timezone identifier. */
const CODE_PARAMETERS = ['timezone', 'alignmentTimezone'] as const satisfies (keyof SchedulingParameterValues)[];

/** Every flat parameter, which is every key of `SchedulingParameterValues`. */
export const FLAT_PARAMETERS = [...DURATION_PARAMETERS, ...CODE_PARAMETERS, 'slotCapacity'] as const;

type FlatParameter = (typeof FLAT_PARAMETERS)[number];
type DurationParameter = (typeof DURATION_PARAMETERS)[number];
type CodeParameter = (typeof CODE_PARAMETERS)[number];

function isDurationParameter(key: FlatParameter): key is DurationParameter {
  return (DURATION_PARAMETERS as readonly string[]).includes(key);
}

function isCodeParameter(key: FlatParameter): key is CodeParameter {
  return (CODE_PARAMETERS as readonly string[]).includes(key);
}

// An alignmentInterval of zero is a legacy encoding of the unset hourly default.
const HOURLY_ALIGNMENT_MINUTES = 60;

function toSubextension(key: FlatParameter, value: number | string): Extension & { url: FlatParameter } {
  if (key === 'slotCapacity') {
    return { url: key, valuePositiveInt: value as number };
  }
  if (isCodeParameter(key)) {
    return { url: key, valueCode: value as string };
  }
  if (isDurationParameter(key)) {
    return { url: key, valueDuration: minutesToSchedulingDuration(value as number) };
  }
  return assertNever(key);
}

function readParameters(read: (url: FlatParameter) => Extension[]): SchedulingParameterValues {
  const values: SchedulingParameterValues = {};

  for (const key of DURATION_PARAMETERS) {
    values[key] = read(key)
      .map((subextension) => schedulingDurationToMinutes(subextension.valueDuration))
      .find(isDefined);
  }

  for (const key of CODE_PARAMETERS) {
    values[key] = read(key)
      .map((subextension) => subextension.valueCode)
      .find(isDefined);
  }

  values.slotCapacity = read('slotCapacity')
    .map((subextension) => subextension.valuePositiveInt)
    .find(isDefined);

  if (values.alignmentInterval === 0) {
    values.alignmentInterval = HOURLY_ALIGNMENT_MINUTES;
  }

  return values;
}

function writeParameters<T>(
  resource: T,
  values: SchedulingParameterValues,
  set: (resource: T, subextension: Extension & { url: FlatParameter }) => T,
  clear: (resource: T, url: FlatParameter) => T
): T {
  let updated = resource;
  for (const key of FLAT_PARAMETERS) {
    const value = values[key];
    updated = value === undefined ? clear(updated, key) : set(updated, toSubextension(key, value));
  }
  return updated;
}

/**
 * Reads the flat scheduling parameters a Schedule sets for a HealthcareService, which are that calendar's
 * own overrides rather than what it ends up scheduling by.
 * @param schedule - Schedule to read
 * @param service - HealthcareService the parameters are scoped to
 * @returns The parameters the calendar overrides, each undefined when it overrides none
 */
export function getScheduleSchedulingParameterValues(
  schedule: Schedule,
  service: WithId<HealthcareService>
): SchedulingParameterValues {
  return readParameters((url) => getScheduleSchedulingParameters(schedule, service, url));
}

/**
 * Reads the flat scheduling parameters a HealthcareService sets for itself.
 * @param service - HealthcareService to read
 * @returns The parameters it sets, each undefined when it sets none
 */
export function getHealthcareServiceSchedulingParameterValues(service: HealthcareService): SchedulingParameterValues {
  return readParameters((url) => getHealthcareServiceSchedulingParameters(service, url));
}

/**
 * Immutably writes the flat scheduling parameters a Schedule overrides for a HealthcareService. The values
 * are the complete state rather than a patch: a key set to undefined, and a key left out, both clear it.
 * @param schedule - Schedule to update
 * @param service - HealthcareService the parameters are scoped to
 * @param values - The parameters the calendar should override, in minutes for every duration
 * @returns A cloned Schedule carrying exactly those overrides for that service
 */
export function setScheduleSchedulingParameterValues<T extends Schedule>(
  schedule: T,
  service: WithId<HealthcareService>,
  values: SchedulingParameterValues
): T {
  return writeParameters(
    schedule,
    values,
    (updated, subextension) => setScheduleSchedulingParameter(updated, service, subextension),
    (updated, url) => clearScheduleSchedulingParameter(updated, service, url)
  );
}

/**
 * Immutably writes the flat scheduling parameters on a HealthcareService. The values are the complete state
 * rather than a patch: a key set to undefined, and a key left out, both clear it.
 * @param service - HealthcareService to update
 * @param values - The parameters it should set, in minutes for every duration
 * @returns A cloned HealthcareService carrying exactly those parameters
 */
export function setHealthcareServiceSchedulingParameterValues<T extends HealthcareService>(
  service: T,
  values: SchedulingParameterValues
): T {
  return writeParameters(
    service,
    values,
    (updated, subextension) => setHealthcareServiceSchedulingParameter(updated, subextension),
    (updated, url) => clearHealthcareServiceSchedulingParameter(updated, url)
  );
}
