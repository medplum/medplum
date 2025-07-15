import { useDebouncedCallback } from '@mantine/hooks';
import { MedplumClient } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';

export const DEFAULT_SAVE_TIMEOUT_MS = 500;

/**
 * Hook that provides a debounced version of medplum's updateResource
 *
 * @param medplum - The MedplumClient instance
 * @param timeoutMs - Optional timeout in milliseconds
 * @returns A debounced function that updates any Medplum resource
 */
export function useDebouncedUpdateResource<T extends Resource>(
  medplum: MedplumClient,
  timeoutMs: number = DEFAULT_SAVE_TIMEOUT_MS
): (resourcePayload: T) => void {
  const debouncedCallback = useDebouncedCallback(async (resourcePayload: T): Promise<void> => {
    try {
      await medplum.updateResource(resourcePayload);
    } catch (error) {
      // Handle error appropriately
      console.error('Failed to update resource:', error);
    }
  }, timeoutMs);

  return (resourcePayload: T): void => {
    debouncedCallback(resourcePayload);
  };
}
