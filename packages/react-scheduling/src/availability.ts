// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * Reads and writes the `availability` scheduling parameter as `HealthcareServiceAvailableTime`, the shape
 * `HealthcareService.availableTime` already holds and the shape the editor edits.
 *
 * `@medplum/core` keeps the generic SchedulingParameters plumbing this is built on, which is untyped by
 * design: a parameter is any sub-extension. The typed availability layer lives here instead, next to the
 * only caller of it, because this package is still alpha and can change it freely.
 */
import type { WithId } from '@medplum/core';
import {
  badRequest,
  getExtensions,
  getScheduleParameters,
  isDayOfWeek,
  OperationOutcomeError,
  setScheduleParameter,
} from '@medplum/core';
import type { Extension, HealthcareService, HealthcareServiceAvailableTime, Schedule } from '@medplum/fhirtypes';

// Convert a single `SchedulingParameters.availability.availableTime`
// sub-sub-extension into a HealthcareServiceAvailableTime.
function toAvailableTime(availableTime: Extension): HealthcareServiceAvailableTime {
  const daysOfWeek = getExtensions(availableTime, 'daysOfWeek')
    .map((subextension) => subextension.valueCode)
    .filter(isDayOfWeek);

  if (getExtensions(availableTime, 'allDay')[0]?.valueBoolean) {
    return { daysOfWeek, allDay: true };
  }

  return {
    daysOfWeek,
    availableStartTime: getExtensions(availableTime, 'availableStartTime')[0]?.valueTime,
    availableEndTime: getExtensions(availableTime, 'availableEndTime')[0]?.valueTime,
  };
}

// The hours a Schedule sets for a service, ignoring the service default, or undefined when it sets none.
// Kept internal: `getEffectiveAvailability` answers what is in effect, and a caller asking the narrower
// question of whether the calendar has hours of its own reads `getScheduleParameters`.
function getScheduleAvailability(
  schedule: Schedule,
  service: WithId<HealthcareService>
): HealthcareServiceAvailableTime[] | undefined {
  const availability = getScheduleParameters(schedule, service, 'availability');

  if (!availability.length) {
    return undefined;
  }

  return availability.flatMap((extension) => getExtensions(extension, 'availableTime')).map(toAvailableTime);
}

/**
 * Resolves the availability in effect for a HealthcareService, on a given calendar or on its own.
 * Hours the Schedule sets for the service take precedence over the service default.
 *
 * Three states are worth telling apart. A Schedule that sets no availability inherits
 * `HealthcareService.availableTime`. One that sets an empty availability means explicitly no hours,
 * which is why that is returned rather than falling through, and also why it cannot be stored: an
 * extension with neither a value nor sub-extensions fails FHIR constraint `ext-1`, so
 * `setScheduleAvailability` refuses to write one. `undefined` means nothing is configured at either
 * level, which scheduling reads as unconstrained rather than unavailable.
 *
 * Omitting the Schedule returns `service.availableTime` and nothing more, so this is not the way to read
 * a service default; the field is. The Schedule is optional so that one call covers a caller that may or
 * may not have one.
 * @param service - HealthcareService providing the default availability
 * @param schedule - Schedule that may set hours of its own for the service
 * @returns The availability in effect, or undefined when none is configured
 */
export function getEffectiveAvailability(
  service: WithId<HealthcareService> | undefined,
  schedule?: Schedule
): HealthcareServiceAvailableTime[] | undefined {
  if (!service) {
    return undefined;
  }

  return (schedule && getScheduleAvailability(schedule, service)) ?? service.availableTime;
}

// One `availability.availableTime` sub-sub-extension. `HealthcareServiceAvailableTime` allows an entry
// with neither `allDay` nor a pair of times, which has no representation here: the sub-extensions would
// carry no value and no children of their own, failing ext-1. Nor is dropping them an option, since the
// scheduling operations read an availableTime with no times at all as no entry, so the hours would go
// missing on read rather than fail on write.
function buildAvailableTimeExtension(entry: HealthcareServiceAvailableTime): Extension {
  const days: Extension[] = (entry.daysOfWeek ?? []).map((day) => ({ url: 'daysOfWeek', valueCode: day }));

  if (entry.allDay) {
    return { url: 'availableTime', extension: [...days, { url: 'allDay', valueBoolean: true }] };
  }

  if (!entry.availableStartTime || !entry.availableEndTime) {
    throw new OperationOutcomeError(
      badRequest('availableTime must set allDay, or both availableStartTime and availableEndTime')
    );
  }

  return {
    url: 'availableTime',
    extension: [
      ...days,
      { url: 'availableStartTime', valueTime: entry.availableStartTime },
      { url: 'availableEndTime', valueTime: entry.availableEndTime },
    ],
  };
}

/**
 * Builds the SchedulingParameters availability sub-extension.
 * @param availableTime - Availability to serialize. Must hold at least one entry, each of which sets
 * either `allDay` or both times.
 * @returns An availability extension containing availableTime entries
 */
function buildAvailabilityExtension(availableTime: HealthcareServiceAvailableTime[]): Extension {
  // No entries would serialize to `{ url: 'availability', extension: [] }`, an extension with neither a
  // value nor sub-extensions, which fails ext-1. Refused rather than treated as no override, because
  // "explicitly no hours" and "follow the service default" are the two states `getEffectiveAvailability`
  // exists to tell apart, and storing one as the other means the opposite of what the caller asked for.
  if (!availableTime.length) {
    throw new OperationOutcomeError(
      badRequest('availability must have at least one availableTime; to follow the service default, clear it instead')
    );
  }

  return { url: 'availability', extension: availableTime.map(buildAvailableTimeExtension) };
}

/**
 * Immutably gives a Schedule its own hours for a HealthcareService, in place of the service default.
 * Reads back through `getEffectiveAvailability`; to drop the calendar back to the default, clear the
 * parameter with `clearScheduleParameter(schedule, service, 'availability')` from `@medplum/core`.
 *
 * Availability is the one parameter with a typed wrapper, because it is the only one that is not a single
 * `value[x]`: `bufferBefore` and the rest go through `setScheduleParameter` directly, already legible as
 * `{ url: 'bufferBefore', valueDuration: { value: 10, unit: 'min' } }`. Availability is a repeating nested
 * structure, so hand-building it at every call site would mean re-deriving the encoding.
 *
 * Schedule level by necessity: a HealthcareService holds its hours in the native `availableTime` field
 * rather than in a scheduling parameter, so there is no service-level counterpart to this. Editing a
 * service default is a plain write to that field, and the parameter stores exactly the same shape.
 * @param schedule - Schedule to update
 * @param service - HealthcareService referenced by the parameters
 * @param availableTime - The full set of windows the calendar should be available in. At least one entry, each
 * setting either `allDay` or both times, since anything else has no valid extension form.
 * @returns A cloned Schedule holding those hours for the service
 * @throws An `OperationOutcomeError` if `availableTime` is empty, or an entry sets neither `allDay` nor both
 * times. To have the calendar follow the service default, clear the parameter instead.
 */
export function setScheduleAvailability(
  schedule: Schedule,
  service: WithId<HealthcareService>,
  availableTime: HealthcareServiceAvailableTime[]
): Schedule {
  return setScheduleParameter(schedule, service, buildAvailabilityExtension(availableTime));
}
