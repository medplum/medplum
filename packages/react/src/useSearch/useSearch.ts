import { QueryTypes, ResourceArray } from '@medplum/core';
import { Bundle, ExtractResource, ResourceType } from '@medplum/fhirtypes';
import { useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export function useSearch<K extends ResourceType>(
  resourceType: K,
  query?: QueryTypes
): Bundle<ExtractResource<K>> | undefined {
  const medplum = useMedplum();
  const [searchKey, setSearchKey] = useState<string>();
  const [bundle, setBundle] = useState<Bundle<ExtractResource<K>>>();

  useEffect(() => {
    const key = medplum.fhirSearchUrl(resourceType, query).toString();
    if (key !== searchKey) {
      setSearchKey(key);
      medplum
        .search(resourceType, query)
        .then(setBundle)
        .catch(() => setBundle(undefined));
    }
  }, [medplum, resourceType, query, searchKey, setBundle]);

  return bundle;
}

export function useSearchOne<K extends ResourceType>(
  resourceType: K,
  query?: QueryTypes
): ExtractResource<K> | undefined {
  const medplum = useMedplum();
  const [searchKey, setSearchKey] = useState<string>();
  const [resource, setResource] = useState<ExtractResource<K>>();

  useEffect(() => {
    const key = medplum.fhirSearchUrl(resourceType, query).toString();
    if (key !== searchKey) {
      setSearchKey(key);
      medplum
        .searchOne(resourceType, query)
        .then(setResource)
        .catch(() => setResource(undefined));
    }
  }, [medplum, resourceType, query, searchKey, setResource]);

  return resource;
}

export function useSearchResources<K extends ResourceType>(
  resourceType: K,
  query?: QueryTypes
): ResourceArray<ExtractResource<K>> | undefined {
  const medplum = useMedplum();
  const [searchKey, setSearchKey] = useState<string>();
  const [resources, setResources] = useState<ResourceArray<ExtractResource<K>>>();

  useEffect(() => {
    const key = medplum.fhirSearchUrl(resourceType, query).toString();
    if (key !== searchKey) {
      setSearchKey(key);
      medplum
        .searchResources(resourceType, query)
        .then(setResources)
        .catch(() => setResources(undefined));
    }
  }, [medplum, resourceType, query, searchKey, setResources]);

  return resources;
}
