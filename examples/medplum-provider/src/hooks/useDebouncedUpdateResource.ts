// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
): (resourcePayload: T) => Promise<T> {
  const debouncedCallback = useDebouncedCallback(async (resourcePayload: T): Promise<T> => {
    return (await medplum.updateResource(resourcePayload)) as T;
  }, timeoutMs);

  return async (resourcePayload: T): Promise<T> => {
    debouncedCallback(resourcePayload);
    return resourcePayload;
  };
}
