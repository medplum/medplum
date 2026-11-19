// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { isServiceKeptAtAnyLocation } from '../AppointmentFinder/AppointmentServiceSelect.utils';

/** How many visit types' availability can be shaded at once, each in a lane of the day's column. */
export const MAX_AVAILABILITY_SERVICES = 3;

/**
 * Works out the Visit Type filter once the sites change: the visit types one of the sites still holds.
 *
 * A list the sites empty goes back to every visit type, not to none. None is something the viewer asks
 * for, and here it was the sites that dropped what they had chosen.
 *
 * @param services - The visit types the filter includes, or undefined for every visit type.
 * @param sites - The sites now chosen.
 * @returns The filter's visit types, or undefined for every visit type.
 */
export function keepServicesAtSites(
  services: readonly WithId<HealthcareService>[] | undefined,
  sites: readonly (Reference<Location> | WithId<Location>)[]
): readonly WithId<HealthcareService>[] | undefined {
  if (!services) {
    return undefined;
  }
  const kept = services.filter((service) => isServiceKeptAtAnyLocation(service, sites));
  return kept.length === 0 && services.length > 0 ? undefined : kept;
}
