import { deepEquals } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import { useEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider';

/**
 * React Hook to use a FHIR reference.
 * Handles the complexity of resolving references and caching resources.
 * @param value The resource or reference to resource.
 * @returns The resolved resource.
 */
export function useResource<T extends Resource>(value: Reference<T> | T | undefined): T | undefined {
  const medplum = useMedplum();
  const referenceRef = useRef<Reference<T> | undefined>(undefined);
  const resourceRef = useRef<T | undefined>(undefined);

  // Reset the reference and resource
  referenceRef.current = undefined;
  resourceRef.current = undefined;

  // Try to convert the value to a reference
  if (value) {
    if ('reference' in value) {
      referenceRef.current = value as Reference<T>;
    } else if ('resourceType' in value) {
      resourceRef.current = value;
      if ('id' in value) {
        referenceRef.current = { reference: value.resourceType + '/' + value.id };
      }
    }
  }

  // Priority order:
  // 1. Cached reference
  // 2. Resource passed in as-is
  // 3. Undefined
  const currentResource =
    (referenceRef.current && medplum.getCachedReference(referenceRef.current)) || resourceRef.current;

  // Keep track of the previous resource
  // This is used to detect when the resource has changed
  // We need a React "state" variable to trigger a re-render
  const [prevResource, setPrevResource] = useState(currentResource);

  // Subscribe to changes to the passed-in value
  useEffect(() => {
    if (referenceRef.current) {
      medplum
        .readReference(referenceRef.current)
        .then((newValue) => {
          if (!deepEquals(newValue, prevResource)) {
            setPrevResource(newValue);
          }
        })
        .catch(console.error);
    }
  }, [medplum, value, prevResource]);

  return currentResource;
}
