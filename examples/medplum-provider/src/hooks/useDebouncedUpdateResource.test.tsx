// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { renderHook, waitFor } from '@testing-library/react';
import type { Patient } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { useDebouncedUpdateResource, DEFAULT_SAVE_TIMEOUT_MS } from './useDebouncedUpdateResource';

describe('useDebouncedUpdateResource', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
  });

  test('debounces resource updates with default timeout', async () => {
    const { result } = renderHook(() => useDebouncedUpdateResource(medplum));

    const mockPatient = { ...HomerSimpson } as Patient & { id: string };
    const updatedPatient1 = { ...HomerSimpson, name: [{ given: ['Jane'], family: 'Simpson' }] } as Patient & {
      id: string;
    };
    const updatedPatient2 = { ...HomerSimpson, name: [{ given: ['Bob'], family: 'Smith' }] } as Patient & {
      id: string;
    };

    const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(updatedPatient2);

    // Call the debounced function multiple times rapidly
    const debouncedUpdate = result.current;
    debouncedUpdate(mockPatient).catch(() => {});
    debouncedUpdate(updatedPatient1).catch(() => {
      // Ignore promise rejections
    });
    debouncedUpdate(updatedPatient2).catch(() => {
      // Ignore promise rejections
    });

    // Should not have been called immediately
    expect(updateSpy).not.toHaveBeenCalled();

    // Wait for debounce timeout
    await waitFor(
      () => {
        // Should have been called only once (last call)
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith(updatedPatient2);
      },
      { timeout: DEFAULT_SAVE_TIMEOUT_MS + 1000 }
    );
  });

  test('debounces resource updates with custom timeout', async () => {
    const customTimeout = 100;
    const { result } = renderHook(() => useDebouncedUpdateResource(medplum, customTimeout));

    const mockPatient = { ...HomerSimpson } as Patient & { id: string };

    const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(mockPatient);

    const debouncedUpdate = result.current;
    debouncedUpdate(mockPatient).catch(() => {
      // Ignore promise rejections
    });

    expect(updateSpy).not.toHaveBeenCalled();

    await waitFor(
      () => {
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith(mockPatient);
      },
      { timeout: customTimeout + 100 }
    );
  });

  test('returns the resource payload immediately', async () => {
    const { result } = renderHook(() => useDebouncedUpdateResource(medplum));

    const mockPatient = { ...HomerSimpson } as Patient & { id: string };

    const debouncedUpdate = result.current;
    const returnedValue = await debouncedUpdate(mockPatient);

    expect(returnedValue).toEqual(mockPatient);
  });

  test('cancels previous pending updates when new update is called', async () => {
    const { result } = renderHook(() => useDebouncedUpdateResource(medplum));

    const mockPatient1 = { ...HomerSimpson, name: [{ given: ['First'], family: 'Simpson' }] } as Patient & {
      id: string;
    };
    const mockPatient2 = { ...HomerSimpson, name: [{ given: ['Second'], family: 'Simpson' }] } as Patient & {
      id: string;
    };

    const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(mockPatient2);

    const debouncedUpdate = result.current;
    debouncedUpdate(mockPatient1).catch(() => {
      // Ignore promise rejections
    });

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, DEFAULT_SAVE_TIMEOUT_MS - 100);
    });

    debouncedUpdate(mockPatient2).catch(() => {
      // Ignore promise rejections
    });

    await waitFor(
      () => {
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith(mockPatient2);
      },
      { timeout: DEFAULT_SAVE_TIMEOUT_MS + 500 }
    );
  });

  test('handles update errors gracefully', async () => {
    const { result } = renderHook(() => useDebouncedUpdateResource(medplum));

    const mockPatient = { ...HomerSimpson } as Patient & { id: string };

    const error = new Error('Update failed');
    const updateSpy = vi.spyOn(medplum, 'updateResource').mockRejectedValue(error);

    let caughtError: Error | undefined;
    const rejectionHandler = (reason: unknown): void => {
      caughtError = reason as Error;
    };
    process.on('unhandledRejection', rejectionHandler);

    try {
      const debouncedUpdate = result.current;
      const returnedValue = await debouncedUpdate(mockPatient);
      expect(returnedValue).toEqual(mockPatient);

      // Wait for debounce timeout - error happens inside debounced callback
      await waitFor(
        () => {
          expect(updateSpy).toHaveBeenCalled();
        },
        { timeout: DEFAULT_SAVE_TIMEOUT_MS + 500 }
      );

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 100);
      });

      // Verify updateResource was called with the correct patient
      expect(updateSpy).toHaveBeenCalledWith(mockPatient);

      // Verify the error was caught (it happens in the debounced callback)
      expect(caughtError).toBe(error);
    } finally {
      process.removeListener('unhandledRejection', rejectionHandler);
    }
  });
});
