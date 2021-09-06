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
export function useResource(value: Reference | Resource | undefined): Resource | undefined {
  const medplum = useMedplum();
  const [resource, setResource] = useState<Resource | undefined>();

  useEffect(() => {
    if (value) {
      if ('resourceType' in value) {
        setResource(value);
      } else if ('reference' in value) {
        if (value.reference === 'system') {
          setResource(system);
        } else {
          medplum.readCachedReference(value).then(setResource);
        }
      }
    }
  }, [value]);

  return resource;
}
