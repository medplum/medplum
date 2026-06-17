// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, SearchRequest, WithId } from '@medplum/core';
import { deepEquals, formatSearchQuery } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export interface ResourceBoardLoadResult<T extends Resource = Resource> {
  readonly items: WithId<T>[];
  readonly total?: number;
}

export interface UseResourceBoardProps<T extends Resource = Resource> {
  // Data
  readonly search: SearchRequest;
  readonly selectedId?: string;
  readonly loadItems?: (search: SearchRequest, medplum: MedplumClient) => Promise<ResourceBoardLoadResult<T>>;
  readonly resolveSelected?: (id: string, items: WithId<T>[], medplum: MedplumClient) => Promise<WithId<T> | undefined>;

  // Callbacks
  readonly onSelectFirst?: (item: WithId<T>) => void;
  readonly onLoad?: (items: WithId<T>[], total: number | undefined) => void;
  readonly onError?: (error: unknown) => void;
}

export interface UseResourceBoardResult<T extends Resource = Resource> {
  readonly items: WithId<T>[];
  readonly total: number | undefined;
  readonly loading: boolean;
  readonly selected: WithId<T> | undefined;
  readonly memoizedSearch: SearchRequest;
  readonly refresh: () => Promise<void>;
}

async function defaultLoadItems<T extends Resource>(
  search: SearchRequest,
  medplum: MedplumClient
): Promise<ResourceBoardLoadResult<T>> {
  const bundle = await medplum.search(
    search.resourceType,
    formatSearchQuery({ ...search, total: search.total ?? 'accurate', fields: undefined }),
    { cache: 'no-cache' }
  );
  // medplum.search is typed by a runtime string resourceType, so narrow the WithId<Resource>
  // results to the caller's T.
  const items = (bundle.entry?.map((entry) => entry.resource).filter((r) => r !== undefined) ?? []) as WithId<T>[];
  return { items, total: bundle.total };
}

/**
 * useResourceBoard manages the data layer for the ResourceBoard component:
 * fetching the resource list, resolving the selected resource, and supporting
 * background refresh.
 * @param options - The data options, a subset of the ResourceBoard props.
 * @returns The loaded resources, total, loading state, resolved selection, and refresh helper.
 */
export function useResourceBoard<T extends Resource = Resource>(
  options: UseResourceBoardProps<T>
): UseResourceBoardResult<T> {
  const { search, selectedId, loadItems } = options;
  const medplum = useMedplum();

  // State
  const [memoizedSearch, setMemoizedSearch] = useState(search);
  const [items, setItems] = useState<WithId<T>[]>([]);
  const [total, setTotal] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<{ id: string; value: WithId<T> | undefined } | undefined>();

  // Refs
  const optionsRef = useRef(options);
  const loadRequestIdRef = useRef(0);
  const selectionRequestIdRef = useRef(0);

  // Derived variables
  const resourceType = memoizedSearch.resourceType;
  const selected = selectedId !== undefined && selectedState?.id === selectedId ? selectedState.value : undefined;

  // Adjust state during render (SearchControl pattern) so a new search shows the
  // skeleton without a synchronous setState inside an effect.
  if (!deepEquals(search, memoizedSearch)) {
    setMemoizedSearch(search);
    setLoading(true);
  }

  const executeLoad = useCallback(async (): Promise<void> => {
    const requestId = ++loadRequestIdRef.current;
    try {
      const result = loadItems
        ? await loadItems(memoizedSearch, medplum)
        : await defaultLoadItems<T>(memoizedSearch, medplum);
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

  // A change to loadItems re-runs executeLoad (it's a dependency below), so the new
  // items load without showing the skeleton — the list updates in place.
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
    const resolve = async (): Promise<WithId<T> | undefined> => {
      const custom = optionsRef.current.resolveSelected;
      if (custom) {
        return custom(selectedId, items, medplum);
      }
      const found = items.find((item) => item.id === selectedId);
      if (found !== undefined) {
        return found;
      }
      return (await medplum.readResource(resourceType, selectedId)) as WithId<T>;
    };
    const resolveSelection = async (): Promise<void> => {
      try {
        const value = await resolve();
        if (requestId === selectionRequestIdRef.current) {
          setSelectedState({ id: selectedId, value });
        }
      } catch (error) {
        if (requestId === selectionRequestIdRef.current) {
          setSelectedState({ id: selectedId, value: undefined });
          (optionsRef.current.onError ?? console.error)(error);
        }
      }
    };
    resolveSelection().catch(console.error);
  }, [selectedId, items, medplum, resourceType]);

  return { items, total, loading, selected, memoizedSearch, refresh: executeLoad };
}
