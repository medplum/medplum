// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDebouncedCallback } from '@mantine/hooks';
import type { MedplumClient } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { useMemo } from 'react';

export const DEFAULT_SAVE_TIMEOUT_MS = 500;

export interface DebouncedUpdateResource<T extends Resource> {
  (resourcePayload: T): Promise<T>;
  cancel: () => void;
}

/**
 * Hook that provides a debounced version of medplum's updateResource
 *
 * @param medplum - The MedplumClient instance
 * @param timeoutMs - Optional timeout in milliseconds
 * @returns A debounced function that updates any Medplum resource, with a cancel() method
 */
export function useDebouncedUpdateResource<T extends Resource>(
  medplum: MedplumClient,
  timeoutMs: number = DEFAULT_SAVE_TIMEOUT_MS
): DebouncedUpdateResource<T> {
  const debouncedCallback = useDebouncedCallback(async (resourcePayload: T): Promise<T> => {
    return (await medplum.updateResource(resourcePayload)) as T;
  }, timeoutMs);

  return useMemo<DebouncedUpdateResource<T>>(
    () =>
      Object.assign(
        async (resourcePayload: T): Promise<T> => {
          debouncedCallback(resourcePayload);
          return resourcePayload;
        },
        { cancel: debouncedCallback.cancel }
      ),
    [debouncedCallback]
  );
}
