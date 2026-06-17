// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Divider, Flex, Group, Pagination, ScrollArea, Stack, Tabs, Text } from '@mantine/core';
import type { MedplumClient, SearchRequest, WithId } from '@medplum/core';
import { DEFAULT_SEARCH_COUNT } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import type { ResourceBoardLoadResult } from '@medplum/react-hooks';
import { useMedplumNavigate, useResourceBoard } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import classes from './ResourceBoard.module.css';
import { ResourceBoardSkeleton } from './ResourceBoardSkeleton';

export interface ResourceBoardTab {
  /**
   * The tab's logical identity, matched against the `activeTab` prop to determine
   * which tab is active. The board cannot derive activeness from the current URL
   * (it has no router access), so consumers derive this key from the URL themselves.
   */
  readonly value: string;
  /** The tab's display label. */
  readonly label: ReactNode;
  /**
   * URI navigated to (via useMedplumNavigate) when this tab is selected.
   * Also rendered as the tab's anchor href, so browser link affordances
   * (right click, middle click, ctrl/meta click) work.
   */
  readonly uri: string;
}

export interface ResourceBoardItemContext<T extends Resource = Resource> {
  readonly selected: boolean;
  readonly index: number;
  /** Full current page of items, for neighbor-aware rendering (e.g. divider hiding). */
  readonly items: WithId<T>[];
}

export interface ResourceBoardDetailContext {
  /** Re-runs the item load and re-resolves the selected resource. Does not show the skeleton. */
  readonly refresh: () => Promise<void>;
}

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
   * Pagination is hidden when omitted. Resetting the offset when filters
   * change remains the consumer's responsibility.
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

// Configs
const DEFAULT_LIST_WIDTH = 350;
const HEADER_HEIGHT = 64;

/**
 * ResourceBoard is a generic master-detail shell: a left sidebar with tabs, header
 * actions, a searchable resource list, and pagination, plus a detail area for the
 * selected resource. It owns data fetching with escape hatches
 * for custom loading and selection resolution.
 * @param props - The ResourceBoard React props.
 * @returns The ResourceBoard React node.
 */
export function ResourceBoard<T extends Resource = Resource>(props: ResourceBoardProps<T>): JSX.Element {
  const {
    onChange,
    selectedId,
    tabs,
    activeTab,
    headerActions,
    renderItem,
    emptyList,
    skeleton,
    listWidth = DEFAULT_LIST_WIDTH,
    renderDetail,
    emptyDetail,
  } = props;

  // Hooks
  const navigate = useMedplumNavigate();
  const { items, total, loading, selected, memoizedSearch, refresh } = useResourceBoard<T>(props);

  // Derived variables
  const count = memoizedSearch.count ?? DEFAULT_SEARCH_COUNT;
  const offset = memoizedSearch.offset ?? 0;
  const currentPage = Math.floor(offset / count) + 1;
  const pageCount = total !== undefined ? Math.ceil(total / count) : 0;
  // Stays mounted across loads so paging doesn't flicker the footer; `total` persists
  // between loads (only the list area swaps to the skeleton).
  const showPagination = !!onChange && total !== undefined && total > count;
  const selectedKey = selected?.id ?? selectedId;

  // Methods
  const handleTabChange = (value: string | null): void => {
    const tab = tabs?.find((t) => t.value === value);
    if (tab) {
      navigate(tab.uri);
    }
  };

  const handlePageChange = (page: number): void => {
    onChange?.({ ...memoizedSearch, offset: (page - 1) * count });
  };

  return (
    <Flex direction="row" h="100%" w="100%" className={classes.container}>
      <Flex direction="column" w={listWidth} h="100%" className={classes.shell}>
        {(tabs || headerActions) && (
          <>
            <Flex h={HEADER_HEIGHT} align="center" justify="space-between" p="md">
              {tabs ? (
                <Tabs
                  value={activeTab ?? null}
                  onChange={handleTabChange}
                  variant="unstyled"
                  className={classes.pillTabs}
                >
                  <Tabs.List>
                    {tabs.map((tab) => (
                      <Tabs.Tab key={tab.value} value={tab.value}>
                        <MedplumLink className={classes.tabLink} to={tab.uri}>
                          {tab.label}
                        </MedplumLink>
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                </Tabs>
              ) : (
                <span />
              )}
              {headerActions && <Group gap="xs">{headerActions}</Group>}
            </Flex>
            <Divider />
          </>
        )}
        <ScrollArea flex={1} scrollbarSize={10} type="hover" scrollHideDelay={250}>
          {loading && (skeleton ?? <ResourceBoardSkeleton />)}
          {!loading && items.length === 0 && (emptyList ?? <DefaultEmptyList />)}
          {!loading &&
            items.map((item, index) => {
              const isSelected = item.id !== undefined && item.id === selectedKey;
              return (
                <div
                  key={item.id ?? index}
                  className={isSelected ? `${classes.item} ${classes.selected}` : classes.item}
                >
                  {renderItem(item, { selected: isSelected, index, items })}
                </div>
              );
            })}
        </ScrollArea>
        {showPagination && (
          <div className={classes.footer}>
            <Pagination
              value={currentPage}
              total={pageCount}
              onChange={handlePageChange}
              size="sm"
              siblings={1}
              boundaries={1}
            />
          </div>
        )}
      </Flex>
      {selected !== undefined ? (
        renderDetail(selected, { refresh })
      ) : (
        <Flex direction="column" style={{ flex: 1 }} h="100%">
          {emptyDetail ?? <DefaultEmptyDetail />}
        </Flex>
      )}
    </Flex>
  );
}

function DefaultEmptyList(): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center" pt="xl">
      <Text c="dimmed" fw={500}>
        No items found
      </Text>
    </Flex>
  );
}

function DefaultEmptyDetail(): JSX.Element {
  return (
    <Center h="100%" w="100%">
      <Stack align="center" gap="xs">
        <Text size="sm" c="dimmed" ta="center">
          Select an item from the list to view details
        </Text>
      </Stack>
    </Center>
  );
}
