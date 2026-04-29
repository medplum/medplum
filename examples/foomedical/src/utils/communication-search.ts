// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { parseSearchRequest } from '@medplum/core';
import type { SearchRequest } from '@medplum/core';

export interface NormalizeCommunicationSearchOptions {
  search?: string;
  defaultSort?: string;
  defaultStatus?: string;
  defaultCount?: string;
  defaultTotal?: string;
}

export interface NormalizeCommunicationSearchResult {
  normalizedSearch: string;
  parsedSearch: SearchRequest;
}

export function normalizeCommunicationSearch({
  search = '',
  defaultSort = '-_lastUpdated',
  defaultStatus = 'in-progress',
  defaultCount = '20',
  defaultTotal = 'accurate',
}: NormalizeCommunicationSearchOptions): NormalizeCommunicationSearchResult {
  const params = new URLSearchParams(search || `_sort=${defaultSort}`);
  const entries = Array.from(params.entries());

  const addIfMissing = (key: string, value: string | undefined): void => {
    if (value && !params.has(key)) {
      entries.push([key, value]);
    }
  };

  addIfMissing('_sort', defaultSort);
  addIfMissing('status', defaultStatus);
  addIfMissing('_count', defaultCount);
  addIfMissing('_total', defaultTotal);

  const normalizedSearch = new URLSearchParams(entries).toString();

  return {
    normalizedSearch,
    parsedSearch: parseSearchRequest(`Communication?${normalizedSearch}`),
  };
}
