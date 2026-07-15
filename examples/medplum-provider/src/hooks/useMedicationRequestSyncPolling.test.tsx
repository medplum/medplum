// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { useMedicationRequestSyncPolling } from './useMedicationRequestSyncPolling';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

function draftMr(id: string): WithId<MedicationRequest> {
  return {
    resourceType: 'MedicationRequest',
    id,
    status: 'draft',
    intent: 'order',
    subject: { reference: 'Patient/p1' },
  };
}

function activeMr(id: string): WithId<MedicationRequest> {
  return { ...draftMr(id), status: 'active' };
}

describe('useMedicationRequestSyncPolling', () => {
  test('does not set allInitiallyUnsyncedSynced when every id is already synced', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'readResource').mockResolvedValue(activeMr('mr-1'));

    const { result } = renderHook(
      () =>
        useMedicationRequestSyncPolling(['mr-1'], {
          enabled: true,
          test: (mr) => mr.status !== 'draft',
          pollIntervalMs: 10_000,
          maxAttempts: 5,
        }),
      { wrapper: wrapper(medplum) }
    );

    await waitFor(() => {
      expect(result.current.syncedIds).toEqual(['mr-1']);
    });
    expect(result.current.unsyncedIds).toEqual([]);
    expect(result.current.allInitiallyUnsyncedSynced).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  test('sets allInitiallyUnsyncedSynced when every initially-unsynced id reconciles', async () => {
    const medplum = new MockClient();
    let releaseSecondSample: (() => void) | undefined;
    const secondSampleGate = new Promise<void>((resolve) => {
      releaseSecondSample = resolve;
    });
    let sample = 0;
    vi.spyOn(medplum, 'readResource').mockImplementation(((_type, id) => {
      // First complete sample stays draft until we open the gate for sample 2+.
      if (sample === 0) {
        return Promise.resolve(draftMr(id));
      }
      return secondSampleGate.then(() => activeMr(id));
    }) as typeof medplum.readResource);

    const { result } = renderHook(
      () =>
        useMedicationRequestSyncPolling(['mr-a', 'mr-b'], {
          enabled: true,
          test: (mr) => mr.status !== 'draft',
          pollIntervalMs: 30,
          maxAttempts: 20,
        }),
      { wrapper: wrapper(medplum) }
    );

    await waitFor(() => {
      expect(result.current.unsyncedIds).toEqual(expect.arrayContaining(['mr-a', 'mr-b']));
    });
    expect(result.current.allInitiallyUnsyncedSynced).toBe(false);
    sample = 1;
    releaseSecondSample?.();

    await waitFor(() => {
      expect(result.current.allInitiallyUnsyncedSynced).toBe(true);
    });
    expect(result.current.unsyncedIds).toEqual([]);
  });

  test('records per-id errors when a read fails', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'readResource').mockImplementation(((_type, id) => {
      if (id === 'mr-bad') {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve(draftMr(id));
    }) as typeof medplum.readResource);

    const { result } = renderHook(
      () =>
        useMedicationRequestSyncPolling(['mr-ok', 'mr-bad'], {
          enabled: true,
          test: (mr) => mr.status !== 'draft',
          pollIntervalMs: 10_000,
          maxAttempts: 5,
        }),
      { wrapper: wrapper(medplum) }
    );

    await waitFor(() => {
      expect(result.current.errors.get('mr-bad')?.message).toBe('not found');
    });
    expect(result.current.allInitiallyUnsyncedSynced).toBe(false);
  });

  test('times out when initially unsynced ids never reconcile', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'readResource').mockResolvedValue(draftMr('mr-1'));

    const { result } = renderHook(
      () =>
        useMedicationRequestSyncPolling(['mr-1'], {
          enabled: true,
          test: (mr) => mr.status !== 'draft',
          pollIntervalMs: 20,
          maxAttempts: 3,
        }),
      { wrapper: wrapper(medplum) }
    );

    await waitFor(() => {
      expect(result.current.unsyncedIds).toEqual(['mr-1']);
    });

    await waitFor(() => {
      expect(result.current.timedOut).toBe(true);
    });
    expect(result.current.allInitiallyUnsyncedSynced).toBe(false);
  });
});
