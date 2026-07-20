// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Divider, Flex, Group, Pagination, ScrollArea, Stack, Tabs, Text } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import classes from './ListWithDetailPane.module.css';
import { ListWithDetailPaneSkeleton } from './ListWithDetailPaneSkeleton';

export interface ListWithDetailPaneTab {
  readonly value: string;
  readonly label: ReactNode;
  readonly uri: string;
}

export interface ListWithDetailPaneItemContext<T extends { id?: string } = Resource> {
  readonly selected: boolean;
  readonly index: number;
  readonly items: T[];
}

export interface ListWithDetailPaneDetailContext {
  readonly refresh: () => Promise<void>;
}

/** Props shared by every ListWithDetailPane, independent of the header style. */
export interface ListWithDetailPanePropsBase<T extends { id?: string } = Resource> {
  // List sidebar
  /** The current page of items to render in the list. */
  readonly items: T[];
  /** When true, the list area shows the skeleton instead of items. */
  readonly loading: boolean;
  /** Id of the highlighted row. */
  readonly selectedKey?: string;
  readonly renderItem: (item: T, ctx: ListWithDetailPaneItemContext<T>) => ReactNode;
  /** Shown when the list is empty. Default: dimmed "No items found". */
  readonly emptyList?: ReactNode;
  /** Shown while loading. Default: built-in skeleton rows. */
  readonly skeleton?: ReactNode;
  /** Sidebar width in pixels. Default 350. */
  readonly listWidth?: number;

  // Header
  /** Right-aligned slot in the sidebar header row: action buttons, filter popovers. */
  readonly headerActions?: ReactNode;

  // Detail
  /** The resolved selected item, or undefined when nothing is selected. */
  readonly selected: T | undefined;
  readonly renderDetail: (selected: T, ctx: ListWithDetailPaneDetailContext) => ReactNode;
  /** Shown when nothing is selected. Default: dimmed prompt. */
  readonly emptyDetail?: ReactNode;
  /** Passed through to the detail render context. */
  readonly refresh: () => Promise<void>;

  // Pagination
  /** Current 1-based page. Pagination is hidden unless this, `pageCount`, and `onPageChange` are set. */
  readonly page?: number;
  /** Total number of pages. Pagination is hidden when this is less than or equal to 1. */
  readonly pageCount?: number;
  /** Fired by the built-in pagination with the new 1-based page. */
  readonly onPageChange?: (page: number) => void;
}

/**
 * Plain-text header (or no header at all). Declares the tab fields as `never` so a title
 * can't be mixed with tabs.
 */
export interface ListWithDetailPaneTextHeaderProps {
  /** Plain title shown at the left of the header. */
  readonly headerText?: ReactNode;
  readonly tabs?: never;
  readonly activeTab?: never;
  readonly onTabChange?: never;
}

/**
 * Pill-tab header. Declares `headerText` as `never` so tabs can't be mixed with a title.
 */
export interface ListWithDetailPaneTabsHeaderProps {
  readonly tabs: ListWithDetailPaneTab[];
  readonly activeTab?: string;
  readonly onTabChange?: (value: string) => void;
  readonly headerText?: never;
}

/** The sidebar header is plain text or pill tabs, never both. */
export type ListWithDetailPaneHeaderProps = ListWithDetailPaneTextHeaderProps | ListWithDetailPaneTabsHeaderProps;

export type ListWithDetailPaneProps<T extends { id?: string } = Resource> = ListWithDetailPanePropsBase<T> &
  ListWithDetailPaneHeaderProps;

// Configs
const DEFAULT_LIST_WIDTH = 350;
const HEADER_HEIGHT = 64;

/**
 * ListWithDetailPane is a generic, presentational master-detail shell: a left sidebar
 * with optional pill tabs, header actions, a scrollable list, and pagination, plus a
 * detail area for the selected item. It does no data fetching or routing — it renders
 * what it is given and emits `onTabChange` / `onPageChange` callbacks.
 * @param props - The ListWithDetailPane React props.
 * @returns The ListWithDetailPane React node.
 */
export function ListWithDetailPane<T extends { id?: string } = Resource>(
  props: ListWithDetailPaneProps<T>
): JSX.Element {
  const {
    items,
    loading,
    selectedKey,
    renderItem,
    emptyList,
    skeleton,
    listWidth = DEFAULT_LIST_WIDTH,
    headerText,
    tabs,
    activeTab,
    onTabChange,
    headerActions,
    selected,
    renderDetail,
    emptyDetail,
    refresh,
    page,
    pageCount,
    onPageChange,
  } = props;

  const handleTabChange = (value: string | null): void => {
    if (value) {
      onTabChange?.(value);
    }
  };

  let headerLeft: ReactNode = <span />;
  if (tabs) {
    headerLeft = (
      <Tabs value={activeTab ?? null} onChange={handleTabChange} variant="unstyled" className={classes.pillTabs}>
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
    );
  } else if (headerText !== undefined) {
    headerLeft = <Text className={classes.headerText}>{headerText}</Text>;
  }

  return (
    <Flex direction="row" h="100%" w="100%" className={classes.container}>
      <Flex direction="column" w={listWidth} h="100%" className={classes.shell}>
        {(tabs || headerActions || headerText) && (
          <>
            <Flex h={HEADER_HEIGHT} align="center" justify="space-between" p="md">
              {headerLeft}
              {headerActions && <Group gap="xs">{headerActions}</Group>}
            </Flex>
            <Divider />
          </>
        )}
        <ScrollArea flex={1} scrollbarSize={10} type="hover" scrollHideDelay={250}>
          {loading && (skeleton ?? <ListWithDetailPaneSkeleton />)}
          {!loading && items.length === 0 && (emptyList ?? <DefaultEmptyList />)}
          {!loading && items.length > 0 && (
            <div className={classes.list}>
              {items.map((item, index) => {
                const isSelected = item.id !== undefined && item.id === selectedKey;
                return (
                  <div key={item.id ?? index} className={cx(classes.item, isSelected && classes.selected)}>
                    {renderItem(item, { selected: isSelected, index, items })}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        {onPageChange !== undefined && page !== undefined && pageCount !== undefined && pageCount > 1 && (
          <div className={classes.footer}>
            <Pagination value={page} total={pageCount} onChange={onPageChange} size="sm" siblings={1} boundaries={1} />
          </div>
        )}
      </Flex>
      {selected === undefined ? (
        <Box flex={1} h="100%">
          {emptyDetail ?? <DefaultEmptyDetail />}
        </Box>
      ) : (
        renderDetail(selected, { refresh })
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
