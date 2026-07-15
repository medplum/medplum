// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedicationRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useRef, useState } from 'react';

export interface UseMedicationRequestSyncPollingOptions {
  /** When false, polling is idle. */
  enabled: boolean;
  /** Returns true when the MedicationRequest has reconciled (no longer pending). */
  test: (mr: MedicationRequest) => boolean;
  /** Poll interval in ms. Defaults to 3500. */
  pollIntervalMs?: number;
  /** Max tick attempts before {@link UseMedicationRequestSyncPollingResult.timedOut}. Defaults to 60. */
  maxAttempts?: number;
}

export interface UseMedicationRequestSyncPollingResult {
  /** Ids that looked synced on the latest complete sample. */
  syncedIds: string[];
  /** Ids from the initial unsynced baseline that are still pending. */
  unsyncedIds: string[];
  /** Per-id read failures from the latest sample (transient failures may clear on the next tick). */
  errors: Map<string, Error>;
  /** True after maxAttempts with a non-empty initial unsynced set. */
  timedOut: boolean;
  /**
   * True once every id that started unsynced has synced. False when the baseline
   * was empty (already synced on open) or polling has not finished.
   */
  allInitiallyUnsyncedSynced: boolean;
}

const DEFAULT_POLL_MS = 3500;
const DEFAULT_MAX_ATTEMPTS = 60;

/**
 * Polls Medplum for a set of `MedicationRequest` ids until each id that started
 * unsynced has passed {@link UseMedicationRequestSyncPollingOptions.test}.
 *
 * Waits for a **complete** first sample (every id read successfully) before
 * recording the baseline, so a failed initial read is not misclassified as
 * "already synced". If every id was already synced on open, polling stops
 * without setting {@link UseMedicationRequestSyncPollingResult.allInitiallyUnsyncedSynced}.
 *
 * @param ids - MedicationRequest ids to watch (order-independent).
 * @param options - Enable flag, sync predicate, and poll tuning.
 * @returns Latest synced/unsynced ids, per-id errors, timeout, and completion flag.
 */
export function useMedicationRequestSyncPolling(
  ids: string[],
  options: UseMedicationRequestSyncPollingOptions
): UseMedicationRequestSyncPollingResult {
  const { enabled, test, pollIntervalMs = DEFAULT_POLL_MS, maxAttempts = DEFAULT_MAX_ATTEMPTS } = options;
  const medplum = useMedplum();

  const watchKey = [...ids]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join(',');

  const [syncedIds, setSyncedIds] = useState<string[]>([]);
  const [unsyncedIds, setUnsyncedIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Map<string, Error>>(() => new Map());
  const [timedOut, setTimedOut] = useState(false);
  const [allInitiallyUnsyncedSynced, setAllInitiallyUnsyncedSynced] = useState(false);

  const pollStartedUnsyncedRef = useRef<Set<string> | null>(null);
  const skipPollRef = useRef(false);
  const testRef = useRef(test);

  useEffect(() => {
    testRef.current = test;
  }, [test]);

  useEffect(() => {
    pollStartedUnsyncedRef.current = null;
    skipPollRef.current = false;
    setSyncedIds([]);
    setUnsyncedIds([]);
    setErrors(new Map());
    setTimedOut(false);
    setAllInitiallyUnsyncedSynced(false);
  }, [enabled, watchKey]);

  useEffect(() => {
    if (!enabled || !watchKey) {
      return undefined;
    }
    const watchedIds = watchKey.split(',');
    let cancelled = false;
    let intervalId: number | undefined;
    let attempts = 0;

    const stop = (): void => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const sampleSyncedById = async (): Promise<[Map<string, boolean>, Map<string, Error>]> => {
      const syncedById = new Map<string, boolean>();
      const sampleErrors = new Map<string, Error>();
      await Promise.all(
        watchedIds.map(async (id) => {
          try {
            const mr = await medplum.readResource('MedicationRequest', id, { cache: 'reload' });
            syncedById.set(id, testRef.current(mr));
          } catch (e) {
            sampleErrors.set(id, e instanceof Error ? e : new Error(String(e)));
          }
        })
      );
      return [syncedById, sampleErrors];
    };

    const tick = async (): Promise<void> => {
      if (skipPollRef.current) {
        return;
      }
      const [syncedById, sampleErrors] = await sampleSyncedById();
      if (cancelled) {
        return;
      }

      setErrors(sampleErrors);

      if (pollStartedUnsyncedRef.current === null) {
        // Wait for a complete first sample so we don't misclassify an id whose
        // initial read failed as "already synced".
        if (syncedById.size < watchedIds.length) {
          return;
        }
        const startedUnsynced = new Set<string>();
        for (const [id, synced] of syncedById) {
          if (!synced) {
            startedUnsynced.add(id);
          }
        }
        pollStartedUnsyncedRef.current = startedUnsynced;
        setSyncedIds([...syncedById].filter(([, synced]) => synced).map(([id]) => id));
        setUnsyncedIds([...startedUnsynced]);
        if (startedUnsynced.size === 0) {
          skipPollRef.current = true;
          stop();
        }
        return;
      }

      const stillPending = [...pollStartedUnsyncedRef.current].filter((id) => !(syncedById.get(id) ?? false));
      setSyncedIds([...syncedById].filter(([, synced]) => synced).map(([id]) => id));
      setUnsyncedIds(stillPending);
      if (stillPending.length === 0) {
        skipPollRef.current = true;
        stop();
        setAllInitiallyUnsyncedSynced(true);
      }
    };

    intervalId = window.setInterval(() => {
      attempts += 1;
      if (attempts >= maxAttempts) {
        stop();
        if (!cancelled && (pollStartedUnsyncedRef.current?.size ?? 0) > 0) {
          setTimedOut(true);
        }
        return;
      }
      tick().catch(() => undefined);
    }, pollIntervalMs);
    tick().catch(() => undefined);

    return (): void => {
      cancelled = true;
      stop();
    };
  }, [enabled, watchKey, medplum, pollIntervalMs, maxAttempts]);

  return { syncedIds, unsyncedIds, errors, timedOut, allInitiallyUnsyncedSynced };
}
