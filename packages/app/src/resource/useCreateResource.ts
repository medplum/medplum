import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

/**
 * React Hook providing helpers to create a FHIR resource.
 * @param resourceType - The FHIR resource type.
 * @param setOutcome - Optional callback to set the OperationOutcome.
 * @returns An object with `defaultValue` to seed a creation view and `handleSubmit`
 * to create the new resource on submission.
 */
export function useCreateResource<T extends Resource>(
  resourceType: string | undefined,
  setOutcome?: (outcome: OperationOutcome | undefined) => void
): {
  defaultValue: T;
  handleSubmit: (newResource: T) => void;
} {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const defaultValue = { resourceType } as T;

  const handleSubmit = (newResource: T): void => {
    if (setOutcome) {
      setOutcome(undefined);
    }
    medplum
      .createResource(newResource)
      .then((result) => navigate('/' + result.resourceType + '/' + result.id))
      .catch((err) => {
        if (setOutcome) {
          setOutcome(normalizeOperationOutcome(err));
        }
        showNotification({
          color: 'red',
          message: normalizeErrorString(err),
          autoClose: false,
          styles: { description: { whiteSpace: 'pre-line' } },
        });
      });
  };

  return {
    defaultValue,
    handleSubmit,
  };
}
