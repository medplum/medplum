// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  getExtensions,
  getReferenceString,
  isDefined,
  schedulingDurationToMinutes,
  SchedulingParametersURI,
} from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';

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

/**
 * Reports whether a chosen service survives a move to a site.
 *
 * Matches `HealthcareService.location` by exact reference, with no `partOf` walk, so
 * a room inside a site does not stand for the site.
 *
 * A service naming no location is kept: nothing about it was ever tied to a site. This
 * is the client-side mirror of the field's pair of searches — `location=<site>` and
 * `location:missing=true` — held to them by nothing but the test that runs both.
 *
 * @param service - The service being checked.
 * @param location - The site being booked at, or undefined for no site at all.
 * @returns Whether the service still stands at that site.
 */
export function isServiceKeptAtLocation(
  service: HealthcareService,
  location: Reference<Location> | WithId<Location> | undefined
): boolean {
  const reference = location && getReferenceString(location);
  const held = service.location ?? [];
  if (!reference || held.length === 0) {
    return true;
  }
  return held.some((site) => site.reference === reference);
}
