import { Device, Reference, Resource } from '@medplum/core';
import { useEffect, useState } from 'react';
import { useMedplum } from './MedplumProvider';

const system: Device = {
  resourceType: 'Device',
  id: 'system',
  deviceName: [{
    name: 'System'
  }]
};

/**
 * React Hook to use a FHIR reference.
 * Handles the complexity of resolving references and caching resources.
 * @param value The resource or reference to resource.
 * @returns The resolved resource.
 */
export function useResource<T extends Resource>(value: Reference<T> | T | undefined): T | undefined {
  const medplum = useMedplum();
  const [resource, setResource] = useState<T | undefined>(value && 'resourceType' in value ? value : undefined);

  useEffect(() => {
    let subscribed = true;

    if (value === resource) {
      // If the value is the same as the current resource, do nothing.
      return;
    }

    if (!value) {
      // If the value is null or undefined, set the resource to undefined.
      setResource(undefined);
      return;
    }

    if ('resourceType' in value) {
      // If the value is a resource, set the resource to the value.
      setResource(value);
      return;
    }

    if ('reference' in value) {
      // If the value is a reference, resolve the reference.
      if (value.reference === 'system') {
        setResource(system as T);
        return;
      }

      medplum.readCachedReference(value).then(r => {
        if (subscribed) {
          setResource(r);
        }
      });
    }

    return (() => subscribed = false) as (() => void);
  }, [value]);

  return resource;
}
