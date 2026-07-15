// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getStatus, OperationOutcomeError } from '@medplum/core';
import { useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

/**
 * Returns true if an error thrown while expanding a ValueSet means the value set itself is
 * unavailable — a permanent 400/404 (e.g. "ValueSet not found"). Transient failures (429 rate
 * limit, 401, 5xx, network) return false so a blip never disables a field.
 * @param err - The error thrown by `valueSetExpand`.
 * @returns True for a permanent 400/404, false for a transient failure.
 */
export function isValueSetUnavailableError(err: unknown): boolean {
  if (err instanceof OperationOutcomeError) {
    const status = getStatus(err.outcome);
    return status === 400 || status === 404;
  }
  return false;
}

/**
 * Probes a ValueSet's availability once on mount using a filter-free, count-limited expansion.
 *
 * A filter-free probe means a 400/404 unambiguously describes the value set itself (unlike a
 * user-typed search, whose 400 can be filter-specific), so the verdict is safe to act on. Repeated
 * probes of the same URL are deduplicated by the `MedplumClient` request cache, which caches
 * rejections too, so many fields bound to the same missing value set cost one request. Recovery
 * after a value set is imported happens on the next mount (i.e. a page refresh) — there is no live
 * subscription.
 * @param binding - The ValueSet URL, or undefined for unbound inputs (always available).
 * @returns undefined while the probe is in flight, true if available, false if unavailable.
 */
export function useValueSetAvailability(binding: string | undefined): boolean | undefined {
  const medplum = useMedplum();
  const [state, setState] = useState<{ binding: string | undefined; isAvailable: boolean | undefined }>(() => ({
    binding,
    isAvailable: binding ? undefined : true,
  }));

  // When the binding changes, reset to 'checking' (undefined) during render so a stale verdict
  // from the previous binding is never shown. This is React's recommended alternative to
  // resetting state with a synchronous setState inside an effect.
  if (state.binding !== binding) {
    setState({ binding, isAvailable: binding ? undefined : true });
  }

  useEffect(() => {
    if (!binding) {
      return undefined;
    }

    let cancelled = false;
    medplum
      .valueSetExpand({ url: binding, count: 1 })
      .then(() => {
        if (!cancelled) {
          setState({ binding, isAvailable: true });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // Only a permanent 400/404 marks the field unavailable; a transient failure keeps it usable
          setState({ binding, isAvailable: !isValueSetUnavailableError(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [medplum, binding]);

  return state.isAvailable;
}
