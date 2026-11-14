// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import { multipleMatches, OperationOutcomeError } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import type { Repository } from './repo';

/**
 * Searches for the one resource matching a search request.
 *
 * When more than one resource matches, a warning is logged and the first match is returned.
 *
 * @param repo - The repository.
 * @param searchRequest - The search request.
 * @returns The matching resource, or undefined if no resource matches.
 */
export async function searchUnique<T extends Resource>(
  repo: Repository,
  searchRequest: SearchRequest<T>
): Promise<WithId<T> | undefined> {
  const effectiveRequest = { ...searchRequest, count: 2 };
  const matches = await repo.searchResources<T>(effectiveRequest);
  if (matches.length > 1) {
    throw new OperationOutcomeError(multipleMatches);
  }
  return matches[0];
}
