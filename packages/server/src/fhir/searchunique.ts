// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import { formatSearchQuery } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { getLogger } from '../logger';
import { LogThrottle } from '../util/logthrottle';
import type { Repository } from './repo';

const multipleMatchesLogThrottle = new LogThrottle(10 * 60 * 1000); // 10 minute window

/**
 * Searches for the one resource matching a search request.
 *
 * When more than one resource matches, a warning is logged and the first match is returned.
 *
 * @param repo - The repository.
 * @param searchRequest - The search request.
 * @param source - Short description of the caller, included in the warning.
 * @returns The matching resource, or undefined if no resource matches.
 */
export async function searchUnique<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest<T>,
  source: string
): Promise<WithId<T> | undefined> {
  const effectiveRequest = { ...searchRequest, count: 2 };
  const matches = await repo.searchResources<T>(effectiveRequest);
  if (matches.length <= 1) {
    return matches[0];
  }

  const projectId = repo.currentProject()?.id;
  const effectiveSearch = effectiveRequest.resourceType + formatSearchQuery(effectiveRequest);
  const matchIds = matches.map((m) => m.id).sort((a, b) => a.localeCompare(b));
  multipleMatchesLogThrottle.maybeLog([projectId, source, effectiveSearch, ...matchIds].join('|'), (suppressed) => {
    getLogger().warn('Search matched multiple resources', {
      source,
      search: effectiveSearch,
      projectId,
      matchIds,
      returnedId: matches[0].id,
      suppressed,
    });
  });
  return matches[0];
}
