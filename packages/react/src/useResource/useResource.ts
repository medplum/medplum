import { deepEquals, isReference, isResource, MedplumClient, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import { useEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider';

/**
 * React Hook to use a FHIR reference.
 * Handles the complexity of resolving references and caching resources.
 * @param value The resource or reference to resource.
 * @returns The resolved resource.
 */
export function useResource<T extends Resource>(
  value: Reference<T> | T | undefined,
  setOutcome?: (outcome: OperationOutcome) => void
): T | undefined {
  const medplum = useMedplum();
  const referenceRef = useRef<Reference<T> | undefined>(undefined);
  const resourceRef = useRef<T | undefined>(undefined);
  const lastRequestedRef = useRef<string | undefined>(undefined);

  // Parse the input value into a reference and resource
  parseValue(value, referenceRef, resourceRef);

  // Priority order:
  // 1. Cached reference
  // 2. Resource passed in as-is
  // 3. Undefined
  const currentResource = getCurrentValue(medplum, referenceRef, resourceRef);

  // Keep track of the previous resource
  // This is used to detect when the resource has changed
  // We need a React "state" variable to trigger a re-render
  const [prevResource, forceRerender] = useState(currentResource);

  // Subscribe to changes to the passed-in value
  useEffect(() => {
    if (referenceRef.current && referenceRef.current.reference !== lastRequestedRef.current) {
      lastRequestedRef.current = referenceRef.current.reference;
      medplum
        .readReference(referenceRef.current)
        .then((newValue) => {
          if (!deepEquals(newValue, prevResource)) {
            forceRerender(newValue);
          }
        })
        .catch((err) => {
          if (setOutcome) {
            setOutcome(normalizeOperationOutcome(err));
          }
        });
    }
  }, [medplum, prevResource, value, setOutcome]);

  return currentResource;
}

/**
 * Parses the input into a reference and resource.
 * @param value The input value to parse. Can be either a reference or a resource.
 * @param referenceRef The output reference.
 * @param resourceRef The output resource.
 */
function parseValue<T extends Resource>(
  value: Reference<T> | T | undefined,
  referenceRef: React.MutableRefObject<Reference<T> | undefined>,
  resourceRef: React.MutableRefObject<T | undefined>
): void {
  // Reset the reference and resource
  referenceRef.current = undefined;
  resourceRef.current = undefined;

  if (!value) {
    return;
  }

  if (isReference<T>(value)) {
    // If the input is a reference then we can use it as-is
    referenceRef.current = value;
  } else if (isResource<T>(value)) {
    resourceRef.current = value;
    if ('id' in value) {
      // If the input is a resource with an ID, then we can still create a reference
      referenceRef.current = { reference: value.resourceType + '/' + value.id };
    }
  }
}

/**
 * Returns the best currently available value.
 * This is ***not*** asynchronous and returns immediately.
 * It attempts to return the value from the cache, or the resource passed in as-is.
 * @param medplum The Medplum client.
 * @param referenceRef The reference.
 * @param resourceRef The resource.
 * @returns The currently available value.
 */
function getCurrentValue<T extends Resource>(
  medplum: MedplumClient,
  referenceRef: React.MutableRefObject<Reference<T> | undefined>,
  resourceRef: React.MutableRefObject<T | undefined>
): T | undefined {
  // Priority order:
  // 1. Cached reference
  // 2. Resource passed in as-is
  // 3. Undefined
  return (referenceRef.current && medplum.getCachedReference(referenceRef.current)) || resourceRef.current;
}
