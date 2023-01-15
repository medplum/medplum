import { MedplumClient } from '@medplum/core';
import { Device, Reference, Resource } from '@medplum/fhirtypes';
import { useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider';

const system: Device = {
  resourceType: 'Device',
  id: 'system',
  deviceName: [
    {
      name: 'System',
    },
  ],
};

/**
 * React Hook to use a FHIR reference.
 * Handles the complexity of resolving references and caching resources.
 * @param value The resource or reference to resource.
 * @returns The resolved resource.
 */
export function useResource<T extends Resource>(value: Reference<T> | T | undefined): T | undefined {
  const medplum = useMedplum();
  const [resource, setResource] = useState<T | undefined>(getInitialResource(medplum, value));

  useEffect(() => {
    let subscribed = true;

    if (!resource && value && 'reference' in value && value.reference) {
      medplum
        .readReference(value as Reference<T>)
        .then((r) => {
          if (subscribed) {
            setResource(r);
          }
        })
        .catch(() => setResource(undefined));
    }

    return (() => (subscribed = false)) as () => void;
  }, [medplum, resource, value]);

  return resource;
}

/**
 * Returns the initial resource value based on the input value.
 * If the input value is a resource, returns the resource.
 * If the input value is a reference to system, returns the system resource.
 * If the input value is a reference to a resource available in the cache, returns the resource.
 * Otherwise, returns undefined.
 * @param medplum The medplum client.
 * @param value The resource or reference to resource.
 * @returns An initial resource if available; undefined otherwise.
 */
function getInitialResource<T extends Resource>(
  medplum: MedplumClient,
  value: Reference<T> | T | undefined
): T | undefined {
  if (!value) {
    return undefined;
  }

  if ('resourceType' in value) {
    return value;
  }

  if ('reference' in value) {
    if (value.reference === 'system') {
      return system as T;
    }

    return medplum.getCachedReference(value);
  }

  return undefined;
}
