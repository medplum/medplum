// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { parseSearchRequest } from '@medplum/core';
import type { SearchRequest, Filter } from '@medplum/core';

export interface NormalizeTaskSearchOptions {
  /**
   * Additional filters to apply to the search request.
   * These filters will be merged with existing filters, replacing any with the same code.
   */
  additionalFilters?: Filter[];
}

export interface NormalizeTaskSearchResult {
  /**
   * The normalized search request with required fields set.
   */
  normalizedSearch: SearchRequest;
  /**
   * Whether navigation is needed to update the URL with normalized parameters.
   */
  needsNavigation: boolean;
}

/**
 * Normalizes a task search request by ensuring required fields are present.
 * Checks for _lastUpdated sort rule, count, and total parameters.
 *
 * @param locationPathname - The pathname from useLocation()
 * @param locationSearch - The search string from useLocation()
 * @param options - Optional configuration for additional filters
 * @returns Normalized search request and whether navigation is needed
 */
export function normalizeTaskSearch(
  locationPathname: string,
  locationSearch: string,
  options?: NormalizeTaskSearchOptions
): NormalizeTaskSearchResult {
  const parsedSearch = parseSearchRequest(locationPathname + locationSearch);
  const lastUpdatedSortRule = parsedSearch.sortRules?.find((rule) => rule.code === '_lastUpdated');

  let filters = parsedSearch.filters || [];
  if (options?.additionalFilters) {
    const additionalFilterCodes = new Set(options.additionalFilters.map((f) => f.code));
    filters = filters.filter((f) => !additionalFilterCodes.has(f.code));
    filters = [...filters, ...options.additionalFilters];
  }

  const normalizedSearch: SearchRequest = {
    ...parsedSearch,
    filters,
    sortRules: lastUpdatedSortRule ? parsedSearch.sortRules : [{ code: '_lastUpdated', descending: true }],
    count: parsedSearch.count || 20,
    total: parsedSearch.total || 'accurate',
  };

  const needsNavigation = !lastUpdatedSortRule || !parsedSearch.count || !parsedSearch.total;

  return {
    normalizedSearch,
    needsNavigation,
  };
}
