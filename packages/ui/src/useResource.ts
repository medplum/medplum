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
  const [resource, setResource] = useState<T | undefined>();

  useEffect(() => {
    let subscribed = true;
    if (value) {
      if ('resourceType' in value) {
        setResource(value);
      } else if ('reference' in value) {
        if (value.reference === 'system') {
          setResource(system as T);
        } else {
          medplum.readCachedReference(value).then(r => {
            if (subscribed) {
              setResource(r);
            }
          });
        }
      }
    }
    return (() => subscribed = false) as (() => void);
  }, [value]);

  return resource;
}
