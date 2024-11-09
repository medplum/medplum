import { allOk, normalizeOperationOutcome, QueryTypes, ResourceArray } from '@medplum/core';
import { Bundle, ExtractResource, OperationOutcome, ResourceType } from '@medplum/fhirtypes';
import { useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

type SearchFn = 'search' | 'searchOne' | 'searchResources';

/**
 * React hook for searching FHIR resources.
 *
 * This is a convenience hook for calling the MedplumClient.search() method.
 *
 * @param resourceType - The FHIR resource type to search.
 * @param query - Optional search parameters.
 * @returns A 3-element tuple containing the search result, loading flag, and operation outcome.
 */
export function useSearch<K extends ResourceType>(
  resourceType: K,
  query?: QueryTypes
): [Bundle<ExtractResource<K>> | undefined, boolean, OperationOutcome | undefined] {
  return useSearchImpl<K, Bundle<ExtractResource<K>>>('search', resourceType, query);
}

/**
 * React hook for searching for a single FHIR resource.
 *
 * This is a convenience hook for calling the MedplumClient.searchOne() method.
 *
 * @param resourceType - The FHIR resource type to search.
 * @param query - Optional search parameters.
 * @returns A 3-element tuple containing the search result, loading flag, and operation outcome.
 */
export function useSearchOne<K extends ResourceType>(
  resourceType: K,
  query?: QueryTypes
): [ExtractResource<K> | undefined, boolean, OperationOutcome | undefined] {
  return useSearchImpl<K, ExtractResource<K>>('searchOne', resourceType, query);
}

/**
 * React hook for searching for an array of FHIR resources.
 *
 * This is a convenience hook for calling the MedplumClient.searchResources() method.
 *
 * @param resourceType - The FHIR resource type to search.
 * @param query - Optional search parameters.
 * @returns A 3-element tuple containing the search result, loading flag, and operation outcome.
 */
export function useSearchResources<K extends ResourceType>(
  resourceType: K,
  query?: QueryTypes
): [ResourceArray<ExtractResource<K>> | undefined, boolean, OperationOutcome | undefined] {
  return useSearchImpl<K, ResourceArray<ExtractResource<K>>>('searchResources', resourceType, query);
}

function useSearchImpl<K extends ResourceType, ReturnType>(
  searchFn: SearchFn,
  resourceType: K,
  query: QueryTypes | undefined
): [ReturnType | undefined, boolean, OperationOutcome | undefined] {
  const medplum = useMedplum();
  const [searchKey, setSearchKey] = useState<string>();
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<ReturnType>();
  const [outcome, setOutcome] = useState<OperationOutcome>();

  useEffect(() => {
    const key = medplum.fhirSearchUrl(resourceType, query).toString();
    if (key !== searchKey) {
      setSearchKey(key);
      medplum[searchFn](resourceType, query)
        .then((res) => {
          setLoading(false);
          setResult(res as ReturnType);
          setOutcome(allOk);
        })
        .catch((err) => {
          setLoading(false);
          setResult(undefined);
          setOutcome(normalizeOperationOutcome(err));
        });
    }
  }, [medplum, searchFn, resourceType, query, searchKey]);

  return [result, loading, outcome];
}
