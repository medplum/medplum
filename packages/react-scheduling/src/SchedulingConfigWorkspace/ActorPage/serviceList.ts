// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { matchesFilter } from '../SchedulingConfigWorkspace.utils';

/**
 * The name a visit type is listed, and searched, by.
 * @param service - The visit type.
 * @returns Its name, or a stand-in when it has none.
 */
export function serviceLabel(service: HealthcareService): string {
  return service.name ?? 'Untitled visit type';
}

/**
 * The visit types whose label matches a filter.
 * @param services - The visit types to filter.
 * @param filterText - What was typed. Blank matches every one.
 * @returns The matches, in the order given.
 */
export function matchingServices(
  services: readonly WithId<HealthcareService>[],
  filterText: string
): WithId<HealthcareService>[] {
  return services.filter((service) => matchesFilter(serviceLabel(service), filterText));
}

/**
 * One page of a long list of visit types: the pinned ones first, whatever the filter, then the first
 * `matchLimit` of the rest that match.
 * @param services - Every visit type in the list, in order.
 * @param filterText - What was typed.
 * @param matchLimit - How many matches to list after the pinned ones.
 * @param pinnedIds - The ids listed first, so a filter can't hide them.
 * @returns The rows to list, how many matches are left out, and every match, listed or not.
 */
export function pageOfServices(
  services: readonly WithId<HealthcareService>[],
  filterText: string,
  matchLimit: number,
  pinnedIds: ReadonlySet<string>
): { rows: WithId<HealthcareService>[]; hiddenCount: number; matches: WithId<HealthcareService>[] } {
  const matches = matchingServices(services, filterText);
  const unpinnedMatches = matches.filter((service) => !pinnedIds.has(service.id));
  return {
    rows: [...services.filter((service) => pinnedIds.has(service.id)), ...unpinnedMatches.slice(0, matchLimit)],
    hiddenCount: Math.max(unpinnedMatches.length - matchLimit, 0),
    matches,
  };
}
