// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, normalizeOperationOutcome, QueryTypes, ResourceArray } from '@medplum/core';
import { Bundle, ExtractResource, OperationOutcome, ResourceType } from '@medplum/fhirtypes';
import { useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';
import { useDebouncedValue } from '../useDebouncedValue/useDebouncedValue';

type SearchFn = 'search' | 'searchOne' | 'searchResources';
export type SearchOptions = { debounceMs?: number };

const DEFAULT_DEBOUNCE_MS = 250;

/**
 * React hook for searching FHIR resources.
 *
 * This is a convenience hook for calling the MedplumClient.search() method.
 *
 * @param resourceType - The FHIR resource type to search.
 * @param query - Optional search parameters.
 * @param options - Optional options for configuring the search.
 * @returns A 3-element tuple containing the search result, loading flag, and operation outcome.
 */
export function useSearch<K extends ResourceType>(
  resourceType: K,
  query?: QueryTypes,
  options?: SearchOptions
): [Bundle<ExtractResource<K>> | undefined, boolean, OperationOutcome | undefined] {
  return useSearchImpl<K, Bundle<ExtractResource<K>>>('search', resourceType, query, options);
}

/**
 * React hook for searching for a single FHIR resource.
 *
 * This is a convenience hook for calling the MedplumClient.searchOne() method.
 *
 * @param resourceType - The FHIR resource type to search.
 * @param query - Optional search parameters.
 * @param options - Optional options for configuring the search.
 * @returns A 3-element tuple containing the search result, loading flag, and operation outcome.
 */
export function useSearchOne<K extends ResourceType>(
  resourceType: K,
  query?: QueryTypes,
  options?: SearchOptions
): [ExtractResource<K> | undefined, boolean, OperationOutcome | undefined] {
  return useSearchImpl<K, ExtractResource<K>>('searchOne', resourceType, query, options);
}

/**
 * React hook for searching for an array of FHIR resources.
 *
 * This is a convenience hook for calling the MedplumClient.searchResources() method.
 *
 * @param resourceType - The FHIR resource type to search.
 * @param query - Optional search parameters.
 * @param options - Optional options for configuring the search.
 * @returns A 3-element tuple containing the search result, loading flag, and operation outcome.
 */
export function useSearchResources<K extends ResourceType>(
  resourceType: K,
  query?: QueryTypes,
  options?: SearchOptions
): [ResourceArray<ExtractResource<K>> | undefined, boolean, OperationOutcome | undefined] {
  return useSearchImpl<K, ResourceArray<ExtractResource<K>>>('searchResources', resourceType, query, options);
}

function useSearchImpl<K extends ResourceType, SearchReturnType>(
  searchFn: SearchFn,
  resourceType: K,
  query: QueryTypes | undefined,
  options?: SearchOptions
): [SearchReturnType | undefined, boolean, OperationOutcome | undefined] {
  const medplum = useMedplum();
  const [lastSearchKey, setLastSearchKey] = useState<string>();
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<SearchReturnType>();
  const [outcome, setOutcome] = useState<OperationOutcome>();

  const searchKey = medplum.fhirSearchUrl(resourceType, query).toString();
  const [debouncedSearchKey] = useDebouncedValue(searchKey, options?.debounceMs ?? DEFAULT_DEBOUNCE_MS, {
    leading: true,
  });

  useEffect(() => {
    if (debouncedSearchKey !== lastSearchKey) {
      setLastSearchKey(debouncedSearchKey);
      medplum[searchFn](resourceType, query)
        .then((res) => {
          setLoading(false);
          setResult(res as SearchReturnType);
          setOutcome(allOk);
        })
        .catch((err) => {
          setLoading(false);
          setResult(undefined);
          setOutcome(normalizeOperationOutcome(err));
        });
    }
  }, [medplum, searchFn, resourceType, query, lastSearchKey, debouncedSearchKey]);

  return [result, loading, outcome];
}
