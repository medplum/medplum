// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  durationToMinutes,
  getExtensions,
  getScheduleParameters,
  isDefined,
  SchedulingParametersURI,
} from '@medplum/core';
import type { Extension, HealthcareService, Schedule } from '@medplum/fhirtypes';

/**
 * Reads the visit length configured for a service, in minutes.
 *
 * The same precedence the server applies: a Schedule's parameters for the
 * service win over the service's own.
 *
 * @param service - The service being booked.
 * @param schedule - A Schedule that may override the service's parameters.
 * @returns The configured length, or undefined when none is configured.
 */
export function getConfiguredDurationMinutes(
  service: WithId<HealthcareService> | undefined,
  schedule?: Schedule
): number | undefined {
  if (!service) {
    return undefined;
  }
  const fromSchedule = schedule
    ? getScheduleParameters(schedule, service, 'duration').map(readDurationMinutes).find(isDefined)
    : undefined;
  if (fromSchedule !== undefined) {
    return fromSchedule;
  }

  // A HealthcareService's parameters are about itself, so there is no service reference to match on.
  return getExtensions(service, [SchedulingParametersURI, 'duration']).map(readDurationMinutes).find(isDefined);
}

function readDurationMinutes(duration: Extension): number | undefined {
  return durationToMinutes(duration.valueDuration);
}
