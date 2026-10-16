// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getScheduleSchedulingParameters } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { getEffectiveSchedulingParameterValues } from '../parameterValues';

/**
 * One line saying how a visit type is scheduled on a Schedule: the duration in effect, and where its hours
 * come from.
 * @param service - The visit type.
 * @param schedule - The Schedule offering it, whose overrides win.
 * @returns The summary, such as `30 min · Visit type's default hours`.
 */
export function summarizeOffering(service: WithId<HealthcareService>, schedule: Schedule): string {
  const { duration } = getEffectiveSchedulingParameterValues(service, schedule);
  const durationText = duration === undefined ? 'No duration' : `${duration} min`;
  return `${durationText} · ${describeHoursSource(service, schedule)}`;
}

function describeHoursSource(service: WithId<HealthcareService>, schedule: Schedule): string {
  if (getScheduleSchedulingParameters(schedule, service, 'availability').length > 0) {
    return 'Custom hours';
  }
  if (service.availableTime?.length) {
    return "Visit type's default hours";
  }
  return 'No hours set';
}
