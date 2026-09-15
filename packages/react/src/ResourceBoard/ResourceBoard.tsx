// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, SearchRequest, WithId } from '@medplum/core';
import { DEFAULT_SEARCH_COUNT } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import type { ResourceBoardLoadResult } from '@medplum/react-hooks';
import { useResourceBoard } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import type {
  ListDetailPaneDetailContext,
  ListDetailPaneHeaderProps,
  ListDetailPaneItemContext,
  ListDetailPaneTab,
} from '../ListDetailPane/ListDetailPane';
import { ListDetailPane } from '../ListDetailPane/ListDetailPane';

// The list/detail shell now lives in ListDetailPane; these aliases keep the
// ResourceBoard public API stable for existing consumers.
export type ResourceBoardTab = ListDetailPaneTab;
export type ResourceBoardItemContext<T extends Resource = Resource> = ListDetailPaneItemContext<WithId<T>>;
export type ResourceBoardDetailContext = ListDetailPaneDetailContext;

/**
 * Props for the ResourceBoard component.
 * @param search - The search definition (resourceType + filters + count/offset), like SearchControl. Default
 * fetching searches with `_total=accurate` and `cache: 'no-cache'`. Deep-equality memoized internally, so parents
 * may pass object literals.
 * @param selectedId - Selected resource id, typically driven by the URL route param.
 * @param loadItems - Custom fetcher replacing the default search (e.g. GraphQL batching, client-side filtering).
 * Re-runs whenever its identity or the search changes — wrap in useCallback.
 * @param resolveSelected - Selected-resource resolution. Default: find in items by id, else
 * `medplum.readResource(search.resourceType, id)`.
 * @param reloadKey - Manual refresh trigger: change this value (e.g. a counter) to re-run the load without changing
 * the search. Reloads in place — no skeleton.
 * @param headerText - Plain title shown at the left of the header when no `tabs` are provided.
 * @param tabs - Sidebar header tabs. Selecting a tab navigates to its URI.
 * @param activeTab - Controlled active tab value; consumers derive it from the URL.
 * @param headerActions - Right-aligned slot in the sidebar header row: action buttons, filter popovers.
 * @param renderItem - Renders one row of the list sidebar.
 * @param emptyList - Shown when the list loads empty. Default: dimmed "No items found".
 * @param skeleton - Shown while the initial or search-change load is in flight. Default: built-in skeleton rows.
 * @param listWidth - Sidebar width in pixels. Default 350.
 * @param renderDetail - Renders the detail pane for the resolved selection.
 * @param emptyDetail - Shown when nothing is selected or the selection cannot be resolved.
 * @param onChange - Fired by the built-in pagination with the updated offset.
 * @param onSelectFirst - Auto-select escape hatch. Fired with the first item when a load for the current search
 * settles with items while nothing is selected (owned by ListDetailPane). The consumer decides how to navigate
 * (e.g. with history replace).
 * @param onLoad - Fired after every successful load.
 * @param onError - List-load and selection-resolution errors. Default: console.error.
 */
export interface ResourceBoardProps<T extends Resource = Resource> {
  readonly search: SearchRequest;
  readonly selectedId?: string;
  readonly loadItems?: (search: SearchRequest, medplum: MedplumClient) => Promise<ResourceBoardLoadResult<T>>;
  readonly resolveSelected?: (id: string, items: WithId<T>[], medplum: MedplumClient) => Promise<WithId<T> | undefined>;
  readonly reloadKey?: unknown;
  readonly headerText?: ReactNode;
  readonly tabs?: ResourceBoardTab[];
  readonly activeTab?: string;
  readonly headerActions?: ReactNode;
  readonly renderItem: (item: WithId<T>, ctx: ResourceBoardItemContext<T>) => ReactNode;
  readonly emptyList?: ReactNode;
  readonly skeleton?: ReactNode;
  readonly listWidth?: number;
  readonly renderDetail: (selected: WithId<T>, ctx: ResourceBoardDetailContext) => ReactNode;
  readonly emptyDetail?: ReactNode;
  readonly onChange?: (search: SearchRequest) => void;
  readonly onSelectFirst?: (item: WithId<T>) => void;
  readonly onLoad?: (items: WithId<T>[], total: number | undefined) => void;
  readonly onError?: (error: unknown) => void;
}

/**
 * ResourceBoard is a generic master-detail board: it owns data fetching (list search,
 * selection resolution, background refresh via useResourceBoard) and renders the
 * presentational shell with ListDetailPane. Escape hatches allow custom loading
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
    headerText,
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
    onLoad,
    onError,
  });

  // Derived variables
  const count = memoizedSearch.count ?? DEFAULT_SEARCH_COUNT;
  const offset = memoizedSearch.offset ?? 0;
  const currentPage = Math.floor(offset / count) + 1;
  const pageCount = total !== undefined ? Math.ceil(total / count) : 0;
  const selectedKey = selected?.id ?? selectedId;

  // Methods
  const handlePageChange = (page: number): void => {
    onChange?.({ ...memoizedSearch, offset: (page - 1) * count });
  };

  // ListDetailPane treats text and tabs as mutually exclusive; tabs take precedence.
  const headerProps: ListDetailPaneHeaderProps = tabs ? { tabs, activeTab } : { headerText };

  return (
    <ListDetailPane<WithId<T>>
      items={items}
      loading={loading}
      selectedKey={selectedKey}
      renderItem={renderItem}
      emptyList={emptyList}
      skeleton={skeleton}
      listWidth={listWidth}
      {...headerProps}
      headerActions={headerActions}
      selected={selected}
      renderDetail={renderDetail}
      emptyDetail={emptyDetail}
      refresh={refresh}
      onSelectFirst={onSelectFirst}
      page={currentPage}
      pageCount={pageCount}
      onPageChange={onChange ? handlePageChange : undefined}
    />
  );
}
