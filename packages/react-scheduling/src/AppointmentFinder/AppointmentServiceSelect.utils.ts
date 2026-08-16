// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtensions, isDefined, schedulingDurationToMinutes, SchedulingParametersURI } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';

/**
 * Reads the visit length a service configures for itself, in minutes.
 * @param service - The service being described.
 * @returns The configured length in minutes, or undefined when none is configured or the
 * configured duration uses a unit scheduling does not accept.
 */
export function getServiceDurationMinutes(service: HealthcareService): number | undefined {
  return getExtensions(service, [SchedulingParametersURI, 'duration'])
    .map((subextension) => schedulingDurationToMinutes(subextension.valueDuration))
    .find(isDefined);
}
