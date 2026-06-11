// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, SearchRequest } from '@medplum/core';
import { deepEquals, formatSearchQuery } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ResourceBoardLoadResult {
  readonly items: Resource[];
  readonly total?: number;
}

export interface UseResourceBoardDataOptions {
  // Data
  readonly search: SearchRequest;
  readonly selectedId?: string;
  readonly loadItems?: (search: SearchRequest, medplum: MedplumClient) => Promise<ResourceBoardLoadResult>;
  readonly resolveSelected?: (id: string, items: Resource[], medplum: MedplumClient) => Promise<Resource | undefined>;

  // Callbacks
  readonly onSelectFirst?: (item: Resource) => void;
  readonly onLoad?: (items: Resource[], total: number | undefined) => void;
  readonly onError?: (error: unknown) => void;
}

export interface UseResourceBoardDataResult {
  readonly items: Resource[];
  readonly total: number | undefined;
  readonly loading: boolean;
  readonly selected: Resource | undefined;
  readonly memoizedSearch: SearchRequest;
  readonly refresh: () => Promise<void>;
}

async function defaultLoadItems(search: SearchRequest, medplum: MedplumClient): Promise<ResourceBoardLoadResult> {
  const bundle = await medplum.search(
    search.resourceType,
    formatSearchQuery({ ...search, total: search.total ?? 'accurate', fields: undefined }),
    { cache: 'no-cache' }
  );
  const items = bundle.entry?.map((entry) => entry.resource).filter((r) => r !== undefined) ?? [];
  return { items, total: bundle.total };
}

/**
 * useResourceBoardData manages the data layer for the ResourceBoard component:
 * fetching the resource list, resolving the selected resource, and supporting
 * background refresh.
 * @param options - The data options, a subset of the ResourceBoard props.
 * @returns The loaded resources, total, loading state, resolved selection, and refresh helper.
 */
export function useResourceBoardData(options: UseResourceBoardDataOptions): UseResourceBoardDataResult {
  const { search, selectedId, loadItems } = options;
  const medplum = useMedplum();

  // State
  const [memoizedSearch, setMemoizedSearch] = useState(search);
  const [prevLoadItems, setPrevLoadItems] = useState<typeof loadItems>(() => loadItems);
  const [items, setItems] = useState<Resource[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  // The resolved selection is tagged with the id it was resolved for, so a stale
  // value is never shown for a different selectedId.
  const [selectedState, setSelectedState] = useState<{ id: string; value: Resource | undefined } | undefined>(
    undefined
  );

  // Refs
  const optionsRef = useRef(options);
  const loadRequestIdRef = useRef(0);
  const selectionRequestIdRef = useRef(0);

  // Derived variables
  const resourceType = memoizedSearch.resourceType;
  const selected = selectedId !== undefined && selectedState?.id === selectedId ? selectedState.value : undefined;

  // Adjust state during render (SearchControl pattern) so a new search or fetcher
  // shows the skeleton without a synchronous setState inside an effect.
  if (!deepEquals(search, memoizedSearch)) {
    setMemoizedSearch(search);
    setLoading(true);
  }
  if (loadItems !== prevLoadItems) {
    setPrevLoadItems(() => loadItems);
    setLoading(true);
  }

  // Methods
  const executeLoad = useCallback(async (): Promise<void> => {
    const requestId = ++loadRequestIdRef.current;
    try {
      const result = loadItems
        ? await loadItems(memoizedSearch, medplum)
        : await defaultLoadItems(memoizedSearch, medplum);
      if (requestId !== loadRequestIdRef.current) {
        return;
      }
      setItems(result.items);
      setTotal(result.total);
      optionsRef.current.onLoad?.(result.items, result.total);
      if (optionsRef.current.selectedId === undefined && result.items.length > 0) {
        optionsRef.current.onSelectFirst?.(result.items[0]);
      }
    } catch (error) {
      if (requestId === loadRequestIdRef.current) {
        (optionsRef.current.onError ?? console.error)(error);
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [memoizedSearch, loadItems, medplum]);

  // Effects
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    executeLoad().catch(console.error);
  }, [executeLoad]);

  // Re-resolves when selectedId or the loaded items change.
  // resolveSelected is read from a ref so unstable identities do not retrigger resolution.
  useEffect(() => {
    const requestId = ++selectionRequestIdRef.current;
    if (!selectedId) {
      return;
    }
    const resolve = async (): Promise<Resource | undefined> => {
      const custom = optionsRef.current.resolveSelected;
      if (custom) {
        return custom(selectedId, items, medplum);
      }
      const found = items.find((item) => item.id === selectedId);
      if (found !== undefined) {
        return found;
      }
      return medplum.readResource(resourceType, selectedId);
    };
    resolve()
      .then((value) => {
        if (requestId === selectionRequestIdRef.current) {
          setSelectedState({ id: selectedId, value });
        }
      })
      .catch((error) => {
        if (requestId === selectionRequestIdRef.current) {
          setSelectedState({ id: selectedId, value: undefined });
          (optionsRef.current.onError ?? console.error)(error);
        }
      });
  }, [selectedId, items, medplum, resourceType]);

  return { items, total, loading, selected, memoizedSearch, refresh: executeLoad };
}
