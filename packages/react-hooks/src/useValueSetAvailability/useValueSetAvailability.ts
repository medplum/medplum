// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getStatus, OperationOutcomeError } from '@medplum/core';
import { useEffect, useMemo, useState } from 'react';
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
 * The result of probing one or more ValueSet URLs for availability.
 */
export interface ValueSetAvailability {
  /** True while at least one requested URL is still being probed. */
  readonly loading: boolean;
  /** The subset of requested URLs known to be available. */
  readonly available: string[];
  /** The subset of requested URLs known to be unavailable (a permanent 400/404). */
  readonly unavailable: string[];
}

const EMPTY_URLS: string[] = [];

/**
 * Probes a set of ValueSet URLs for availability, each with a filter-free, count-limited expansion.
 *
 * A filter-free probe means a 400/404 unambiguously describes the value set itself (unlike a
 * user-typed search, whose 400 can be filter-specific), so the verdict is safe to act on. Repeated
 * probes of the same URL are deduplicated by the `MedplumClient` request cache, which caches
 * rejections too, so many fields bound to the same missing value set cost one request. Recovery
 * after a value set is imported happens on the next mount (i.e. a page refresh) — there is no live
 * subscription. Transient failures (429/5xx/network) resolve as available so a blip never disables
 * a field; only a permanent 400/404 marks a URL unavailable.
 * @param urls - The ValueSet URLs to probe. Falsy entries are ignored, and duplicates collapse to a
 * single probe.
 * @returns The availability verdict, with `loading` true until every requested URL has settled.
 */
export function useValueSetAvailabilities(urls: readonly (string | undefined)[]): ValueSetAvailability {
  const medplum = useMedplum();

  // A stable, order-independent key for the set of URLs to probe. Callers typically pass a fresh
  // array literal every render, so we derive downstream memo and effect dependencies from this
  // string rather than the array identity.
  const key = Array.from(new Set(urls.filter((u): u is string => Boolean(u))))
    .sort((a, b) => a.localeCompare(b))
    .join('\n');
  const uniqueUrls = useMemo(() => (key === '' ? EMPTY_URLS : key.split('\n')), [key]);

  // Per-URL verdict: true = available, false = unavailable. A URL absent from the map is still
  // being probed. Verdicts persist across renders so a URL that stays in the set never re-flashes
  // to "checking".
  const [verdicts, setVerdicts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (uniqueUrls.length === 0) {
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();

    for (const url of uniqueUrls) {
      medplum
        .valueSetExpand({ url, count: 1 }, { signal: controller.signal })
        .then(() => {
          if (!cancelled) {
            setVerdicts((prev) => ({ ...prev, [url]: true }));
          }
        })
        .catch((err) => {
          if (!cancelled) {
            // Only a permanent 400/404 marks the URL unavailable; a transient failure keeps it usable
            setVerdicts((prev) => ({ ...prev, [url]: !isValueSetUnavailableError(err) }));
          }
        });
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [medplum, uniqueUrls]);

  return useMemo(() => {
    const available: string[] = [];
    const unavailable: string[] = [];
    let loading = false;
    for (const url of uniqueUrls) {
      const verdict = verdicts[url];
      if (verdict === undefined) {
        loading = true;
      } else if (verdict) {
        available.push(url);
      } else {
        unavailable.push(url);
      }
    }
    return { loading, available, unavailable };
  }, [uniqueUrls, verdicts]);
}

/**
 * Probes a single ValueSet's availability once on mount. A thin wrapper around
 * {@link useValueSetAvailabilities} for the common single-value-set case.
 * @param url - The ValueSet URL, or undefined for unbound inputs (always available).
 * @returns undefined while the probe is in flight, true if available, false if unavailable.
 */
export function useValueSetAvailability(url: string | undefined): boolean | undefined {
  const { loading, unavailable } = useValueSetAvailabilities(url ? [url] : EMPTY_URLS);
  if (!url) {
    return true;
  }
  if (loading) {
    return undefined;
  }
  return !unavailable.includes(url);
}
