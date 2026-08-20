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
 * A named site is matched the way the pick list matches it: `AppointmentServiceSelect`
 * narrows on the `location` parameter, which reads `HealthcareService.location` by
 * exact reference and does not walk `partOf`, so a room inside a site does not
 * stand for the site.
 *
 * A service naming no location at all is kept, because nothing about it was ever
 * tied to a site and so no site can invalidate it. That is deliberately not what
 * the search does — a reference search needs the element present, so such a
 * service matches no site and is not *offered* once one is chosen even though it
 * is *kept* when it was chosen first.
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
