import { tryGetDataType } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useRef, useState } from 'react';

type UseResourceTypeOptions = {
  onInvalidResourceType?: (resourceType: string) => void;
};

export function useResourceType(
  resourceType: string | undefined,
  options?: UseResourceTypeOptions
): ResourceType | undefined {
  const medplum = useMedplum();

  const lastInput = useRef<string | undefined>(resourceType);
  const [validatedResourceType, setValidatedResourceType] = useState<ResourceType | undefined>();

  useEffect(() => {
    if (resourceType !== lastInput.current) {
      lastInput.current = resourceType;
      setValidatedResourceType(undefined);
      if (resourceType) {
        medplum
          .requestSchema(resourceType)
          .then(() => {
            if (!tryGetDataType(resourceType)) {
              setValidatedResourceType(undefined);
              if (options?.onInvalidResourceType) {
                options.onInvalidResourceType(resourceType);
              }
            } else {
              setValidatedResourceType(resourceType as ResourceType);
            }
          })
          .catch(console.error);
      }
    }
  }, [medplum, options, resourceType]);

  return validatedResourceType;
}
