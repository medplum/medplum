// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDebouncedValue } from '@mantine/hooks';
import { normalizeErrorString } from '@medplum/core';
import { useEffect, useState } from 'react';

/** How long typing settles before the list is searched again. */
const SEARCH_DEBOUNCE_MS = 250;

export interface PickListSearch<T> {
  readonly items: readonly T[];
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly query: string;
  readonly setQuery: (query: string) => void;
}

/**
 * Keeps a pick list stocked from the server as its search is typed into.
 *
 * The narrowing is done by the server rather than in the browser: a practice
 * with dozens of sites and visit types is more than one page of results, so
 * filtering what happened to be fetched first would quietly hide the rest.
 *
 * @param load - Runs one search. Must be stable, so wrap it in `useCallback`.
 * @returns The current results, the search text, and how the search is going.
 */
export function usePickListSearch<T>(load: (query: string, signal: AbortSignal) => Promise<T[]>): PickListSearch<T> {
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [items, setItems] = useState<readonly T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);

    load(debouncedQuery, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setItems(result);
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(normalizeErrorString(reason));
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [load, debouncedQuery]);

  return { items, loading, error, query, setQuery };
}
