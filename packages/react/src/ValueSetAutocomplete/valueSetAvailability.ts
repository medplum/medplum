// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getStatus, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useSyncExternalStore } from 'react';

export type ValueSetAvailability =
  | { readonly status: 'checking' }
  | { readonly status: 'available' }
  | { readonly status: 'unavailable'; readonly message: string };

const CHECKING: ValueSetAvailability = { status: 'checking' };
const AVAILABLE: ValueSetAvailability = { status: 'available' };

// How long an 'unavailable' verdict is trusted before a new consumer triggers a re-probe,
// so fields recover after a value set is imported/linked without hammering known-missing
// URLs on every page navigation
const UNAVAILABLE_RETRY_INTERVAL_MS = 60_000;

interface CacheEntry {
  snapshot: ValueSetAvailability;
  listeners: Set<() => void>;
  updatedAt: number;
  probe?: Promise<void>;
}

// One availability result per ValueSet URL per client, shared by every field bound to it,
// so a missing value set is probed once per mounted form rather than once per field per keystroke
const caches = new WeakMap<MedplumClient, Map<string, CacheEntry>>();

function ensureEntry(medplum: MedplumClient, binding: string): CacheEntry {
  let cache = caches.get(medplum);
  if (!cache) {
    cache = new Map();
    caches.set(medplum, cache);
  }
  let entry = cache.get(binding);
  if (!entry) {
    entry = { snapshot: CHECKING, listeners: new Set(), updatedAt: Date.now() };
    cache.set(binding, entry);
  }
  return entry;
}

function shouldProbe(entry: CacheEntry): boolean {
  if (entry.probe) {
    return false;
  }
  if (entry.snapshot.status === 'checking') {
    return true;
  }
  // A confirmed 'available' never re-probes; a confirmed 'unavailable' re-probes after the
  // retry interval so mid-session imports are picked up
  return entry.snapshot.status === 'unavailable' && Date.now() - entry.updatedAt > UNAVAILABLE_RETRY_INTERVAL_MS;
}

function probeEntry(medplum: MedplumClient, binding: string, entry: CacheEntry): Promise<void> {
  if (!entry.probe) {
    // The probe is a filter-free, count-limited expansion, so a 400/404 here unambiguously
    // describes the value set itself — unlike user-typed searches, whose 400s can be
    // filter-specific and must never latch the shared cache
    entry.probe = medplum
      .valueSetExpand({ url: binding, count: 1 })
      .then(() => setSnapshot(entry, AVAILABLE))
      .catch((err) => {
        const unavailable = classifyValueSetError(err);
        if (unavailable) {
          setSnapshot(entry, unavailable);
        } else {
          // A transient failure (429, 5xx, network) never manufactures a verdict: a
          // 'checking' entry stays checking (re-probed on next use) and a previously
          // latched 'unavailable' entry keeps its verdict
          entry.updatedAt = Date.now();
        }
      })
      .finally(() => {
        entry.probe = undefined;
      });
  }
  return entry.probe;
}

function classifyValueSetError(err: unknown): ValueSetAvailability | undefined {
  // Only a 400/404 outcome (e.g. "ValueSet not found") means the value set is unavailable;
  // transient failures (429 rate limit, 401, 5xx, network) return undefined
  if (err instanceof OperationOutcomeError) {
    const status = getStatus(err.outcome);
    if (status === 400 || status === 404) {
      return { status: 'unavailable', message: normalizeErrorString(err) };
    }
  }
  return undefined;
}

function setSnapshot(entry: CacheEntry, snapshot: ValueSetAvailability): void {
  entry.snapshot = snapshot;
  entry.updatedAt = Date.now();
  for (const listener of entry.listeners) {
    listener();
  }
}

export function getValueSetAvailability(medplum: MedplumClient, binding: string): ValueSetAvailability {
  return caches.get(medplum)?.get(binding)?.snapshot ?? CHECKING;
}

export function isValueSetUnavailable(medplum: MedplumClient, binding: string): boolean {
  return getValueSetAvailability(medplum, binding).status === 'unavailable';
}

/**
 * Checks the availability of a ValueSet, probing it (or awaiting an in-flight probe) through
 * the shared per-client cache.
 * @param medplum - The Medplum client instance.
 * @param binding - The ValueSet URL.
 * @returns The availability of the ValueSet.
 */
export async function checkValueSetAvailability(
  medplum: MedplumClient,
  binding: string
): Promise<ValueSetAvailability> {
  const entry = ensureEntry(medplum, binding);
  if (entry.probe || shouldProbe(entry)) {
    await probeEntry(medplum, binding, entry);
  }
  return entry.snapshot;
}

/**
 * Subscribes to the availability of a ValueSet, probing it on first use.
 * @param binding - The ValueSet URL, or undefined for unbound inputs.
 * @returns The current availability of the ValueSet.
 */
export function useValueSetAvailability(binding: string | undefined): ValueSetAvailability {
  const medplum = useMedplum();

  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      if (!binding) {
        return () => undefined;
      }
      const entry = ensureEntry(medplum, binding);
      if (shouldProbe(entry)) {
        probeEntry(medplum, binding, entry).catch(console.error);
      }
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    [medplum, binding]
  );

  const getSnapshot = useCallback(
    (): ValueSetAvailability => (binding ? getValueSetAvailability(medplum, binding) : AVAILABLE),
    [medplum, binding]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
