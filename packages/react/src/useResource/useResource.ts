import { deepEquals, isReference, isResource, MedplumClient, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import { useCallback, useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider';

/**
 * React Hook to use a FHIR reference.
 * Handles the complexity of resolving references and caching resources.
 * @param value The resource or reference to resource.
 * @param setOutcome Optional callback to set the OperationOutcome.
 * @returns The resolved resource.
 */
export function useResource<T extends Resource>(
  value: Reference<T> | T | undefined,
  setOutcome?: (outcome: OperationOutcome) => void
): T | undefined {
  const medplum = useMedplum();
  const [resource, setResource] = useState<T | undefined>(getInitialResource(medplum, value));

  const setResourceIfChanged = useCallback(
    (r: T | undefined) => {
      if (!deepEquals(r, resource)) {
        setResource(r);
      }
    },
    [resource, setResource]
  );

  useEffect(() => {
    setResourceIfChanged(getInitialResource(medplum, value));
  }, [medplum, value, setResourceIfChanged]);

  useEffect(() => {
    let subscribed = true;

    if (isReference(value)) {
      medplum
        .readReference(value as Reference<T>)
        .then((r) => {
          if (subscribed) {
            setResourceIfChanged(r);
          }
        })
        .catch((err) => {
          if (subscribed) {
            setResourceIfChanged(undefined);
            if (setOutcome) {
              setOutcome(normalizeOperationOutcome(err));
            }
          }
        });
    }

    return (() => (subscribed = false)) as () => void;
  }, [medplum, resource, value, setResourceIfChanged, setOutcome]);

  return resource;
}

/**
 * Returns the initial resource value based on the input value.
 * If the input value is a resource, returns the resource.
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
  if (value) {
    if (isResource(value)) {
      return value;
    }

    if (isReference(value)) {
      return medplum.getCachedReference(value as Reference<T>);
    }
  }

  return undefined;
}
