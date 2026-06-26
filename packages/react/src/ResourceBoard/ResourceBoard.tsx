// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, SearchRequest, WithId } from '@medplum/core';
import { DEFAULT_SEARCH_COUNT } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import type { ResourceBoardLoadResult } from '@medplum/react-hooks';
import { useMedplumNavigate, useResourceBoard } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import type {
  ListWithDetailPaneDetailContext,
  ListWithDetailPaneItemContext,
  ListWithDetailPaneTab,
} from '../ListWithDetailPane/ListWithDetailPane';
import { ListWithDetailPane } from '../ListWithDetailPane/ListWithDetailPane';

// The list/detail shell now lives in ListWithDetailPane; these aliases keep the
// ResourceBoard public API stable for existing consumers.
export type ResourceBoardTab = ListWithDetailPaneTab;
export type ResourceBoardItemContext<T extends Resource = Resource> = ListWithDetailPaneItemContext<WithId<T>>;
export type ResourceBoardDetailContext = ListWithDetailPaneDetailContext;

export interface ResourceBoardProps<T extends Resource = Resource> {
  // Data
  /**
   * The search definition (resourceType + filters + count/offset), like SearchControl.
   * Default fetching searches with `_total=accurate` and `cache: 'no-cache'`.
   * Deep-equality memoized internally, so parents may pass object literals.
   */
  readonly search: SearchRequest;
  /** Selected resource id, typically driven by the URL route param. */
  readonly selectedId?: string;
  /**
   * Custom fetcher replacing the default search (e.g. GraphQL batching, client-side
   * filtering). Re-runs whenever its identity or the search changes — wrap in useCallback.
   */
  readonly loadItems?: (search: SearchRequest, medplum: MedplumClient) => Promise<ResourceBoardLoadResult<T>>;
  /**
   * Selected-resource resolution. Default: find in items by id, else
   * `medplum.readResource(search.resourceType, id)`.
   */
  readonly resolveSelected?: (id: string, items: WithId<T>[], medplum: MedplumClient) => Promise<WithId<T> | undefined>;
  /**
   * Manual refresh trigger: change this value (e.g. a counter) to re-run the load
   * without changing the search. Reloads in place — no skeleton.
   */
  readonly reloadKey?: unknown;

  // Sidebar header
  /** Sidebar header tabs. Selecting a tab navigates to its URI. */
  readonly tabs?: ResourceBoardTab[];
  /** Controlled active tab value; consumers derive it from the URL. */
  readonly activeTab?: string;
  /** Right-aligned slot in the sidebar header row: action buttons, filter popovers. */
  readonly headerActions?: ReactNode;

  // List
  readonly renderItem: (item: WithId<T>, ctx: ResourceBoardItemContext<T>) => ReactNode;
  /** Shown when the list loads empty. Default: dimmed "No items found". */
  readonly emptyList?: ReactNode;
  /** Shown while the initial or search-change load is in flight. Default: built-in skeleton rows. */
  readonly skeleton?: ReactNode;
  /** Sidebar width in pixels. Default 350. */
  readonly listWidth?: number;

  // Detail
  readonly renderDetail: (selected: WithId<T>, ctx: ResourceBoardDetailContext) => ReactNode;
  /** Shown when nothing is selected or the selection cannot be resolved. */
  readonly emptyDetail?: ReactNode;

  // Callbacks
  /**
   * Fired by the built-in pagination with the updated offset.
   */
  readonly onChange?: (search: SearchRequest) => void;
  /**
   * Auto-select escape hatch. Called with the first item when a load for the
   * current search completes with items while `selectedId` is undefined.
   * The consumer decides how to navigate (e.g. with history replace).
   */
  readonly onSelectFirst?: (item: WithId<T>) => void;
  /** Fired after every successful load. */
  readonly onLoad?: (items: WithId<T>[], total: number | undefined) => void;
  /** List-load and selection-resolution errors. Default: console.error. */
  readonly onError?: (error: unknown) => void;
}

/**
 * ResourceBoard is a generic master-detail board: it owns data fetching (list search,
 * selection resolution, background refresh via useResourceBoard) and renders the
 * presentational shell with ListWithDetailPane. Escape hatches allow custom loading
 * and selection resolution.
 * @param props - The ResourceBoard React props.
 * @returns The ResourceBoard React node.
 */
export function ResourceBoard<T extends Resource = Resource>(props: ResourceBoardProps<T>): JSX.Element {
  const {
    search,
    selectedId,
    loadItems,
    resolveSelected,
    reloadKey,
    tabs,
    activeTab,
    headerActions,
    renderItem,
    emptyList,
    skeleton,
    listWidth,
    renderDetail,
    emptyDetail,
    onChange,
    onSelectFirst,
    onLoad,
    onError,
  } = props;

  // Hooks
  const navigate = useMedplumNavigate();
  // The hook returns the effective (deep-equality stable) search; alias it locally to
  // avoid colliding with the `search` prop, which is the raw input.
  const {
    items,
    total,
    loading,
    selected,
    search: memoizedSearch,
    refresh,
  } = useResourceBoard<T>({
    search,
    selectedId,
    loadItems,
    resolveSelected,
    reloadKey,
    onSelectFirst,
    onLoad,
    onError,
  });

  // Derived variables
  const count = memoizedSearch.count ?? DEFAULT_SEARCH_COUNT;
  const offset = memoizedSearch.offset ?? 0;
  const currentPage = Math.floor(offset / count) + 1;
  // `total` persists between loads, so the footer stays mounted and paging doesn't flicker.
  const pageCount = total !== undefined ? Math.ceil(total / count) : 0;
  const selectedKey = selected?.id ?? selectedId;

  // Methods
  const handleTabChange = (value: string): void => {
    const tab = tabs?.find((t) => t.value === value);
    if (tab) {
      navigate(tab.uri);
    }
  };

  const handlePageChange = (page: number): void => {
    onChange?.({ ...memoizedSearch, offset: (page - 1) * count });
  };

  return (
    <ListWithDetailPane<WithId<T>>
      items={items}
      loading={loading}
      selectedKey={selectedKey}
      renderItem={renderItem}
      emptyList={emptyList}
      skeleton={skeleton}
      listWidth={listWidth}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      headerActions={headerActions}
      selected={selected}
      renderDetail={renderDetail}
      emptyDetail={emptyDetail}
      refresh={refresh}
      page={currentPage}
      pageCount={pageCount}
      onPageChange={onChange ? handlePageChange : undefined}
    />
  );
}
