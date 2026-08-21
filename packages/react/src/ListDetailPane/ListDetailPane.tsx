// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Center, Divider, Flex, Group, Pagination, ScrollArea, Stack, Tabs, Text } from '@mantine/core';
import type { Resource } from '@medplum/fhirtypes';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import classes from './ListDetailPane.module.css';
import { ListDetailPaneSkeleton } from './ListDetailPaneSkeleton';

export interface ListDetailPaneTab {
  readonly value: string;
  readonly label: ReactNode;
  readonly uri: string;
}

export interface ListDetailPaneItemContext<T extends { id?: string } = Resource> {
  readonly selected: boolean;
  readonly index: number;
  readonly items: T[];
}

export interface ListDetailPaneDetailContext {
  readonly refresh: () => Promise<void>;
}

/**
 * Props shared by every ListDetailPane, independent of the header style.
 * @param items - The current page of items to render in the list.
 * @param loading - When true, the list area shows the skeleton instead of items.
 * @param selectedKey - Id of the highlighted row.
 * @param renderItem - Renders one row of the list sidebar.
 * @param emptyList - Shown when the list is empty. Default: dimmed "No items found".
 * @param skeleton - Shown while loading. Default: built-in skeleton rows.
 * @param listWidth - Sidebar width in pixels. Default 350.
 * @param listVisible - Whether the list sidebar is shown. Default true. When false the sidebar collapses
 * (animated) and is removed from the accessibility tree. Controlled — consumers render their own toggle
 * buttons (typically a collapse icon in `headerActions` and an expand icon somewhere in the detail pane).
 * @param headerActions - Right-aligned slot in the sidebar header row: action buttons, filter popovers.
 * @param selected - The resolved selected item, or undefined when nothing is selected.
 * @param renderDetail - Renders the detail pane for the selected item.
 * @param emptyDetail - Shown when nothing is selected. Default: dimmed prompt.
 * @param refresh - Passed through to the detail render context.
 * @param onSelectFirst - Auto-select escape hatch. Fired with the first item when the list has finished loading
 * (`loading` false) with items while nothing is selected (`selectedKey` undefined). The consumer decides how to
 * navigate (typically with history replace). Pass an id-driven `selectedKey` (e.g. the URL route param) so a
 * selection that is still resolving does not read as "nothing selected", and keep `loading` true from the render a
 * new search starts on, so this never fires against a stale list.
 * @param page - Current 1-based page. Pagination is hidden unless this, `pageCount`, and `onPageChange` are set.
 * @param pageCount - Total number of pages. Pagination is hidden when this is less than or equal to 1.
 * @param onPageChange - Fired by the built-in pagination with the new 1-based page.
 */
export interface ListDetailPanePropsBase<T extends { id?: string } = Resource> {
  readonly items: T[];
  readonly loading: boolean;
  readonly selectedKey?: string;
  readonly renderItem: (item: T, ctx: ListDetailPaneItemContext<T>) => ReactNode;
  readonly emptyList?: ReactNode;
  readonly skeleton?: ReactNode;
  readonly listWidth?: number;
  readonly listVisible?: boolean;
  readonly headerActions?: ReactNode;
  readonly selected: T | undefined;
  readonly renderDetail: (selected: T, ctx: ListDetailPaneDetailContext) => ReactNode;
  readonly emptyDetail?: ReactNode;
  readonly refresh: () => Promise<void>;
  readonly onSelectFirst?: (item: T) => void;
  readonly page?: number;
  readonly pageCount?: number;
  readonly onPageChange?: (page: number) => void;
}

/**
 * Plain-text header (or no header at all). Declares the tab fields as `never` so a title
 * can't be mixed with tabs.
 * @param headerText - Plain title shown at the left of the header.
 */
export interface ListDetailPaneTextHeaderProps {
  readonly headerText?: ReactNode;
  readonly tabs?: never;
  readonly activeTab?: never;
}

/**
 * Pill-tab header. Declares `headerText` as `never` so tabs can't be mixed with a title.
 * Each tab renders as a link to its `uri`, so tab switching needs no change callback.
 * @param tabs - Sidebar header tabs. Selecting a tab navigates to its URI.
 * @param activeTab - Controlled active tab value; consumers derive it from the URL.
 */
export interface ListDetailPaneTabsHeaderProps {
  readonly tabs: ListDetailPaneTab[];
  readonly activeTab?: string;
  readonly headerText?: never;
}

/** The sidebar header is plain text or pill tabs, never both. */
export type ListDetailPaneHeaderProps = ListDetailPaneTextHeaderProps | ListDetailPaneTabsHeaderProps;

export type ListDetailPaneProps<T extends { id?: string } = Resource> = ListDetailPanePropsBase<T> &
  ListDetailPaneHeaderProps;

// Configs
const DEFAULT_LIST_WIDTH = 350;
const HEADER_HEIGHT = 64;

/**
 * ListDetailPane is a generic, presentational master-detail shell: a left sidebar
 * with optional pill tabs, header actions, a scrollable list, and pagination, plus a
 * detail area for the selected item. It does no data fetching — it renders what it is
 * given, navigates via links, and emits `onPageChange` / `onSelectFirst` callbacks.
 * @param props - The ListDetailPane React props.
 * @returns The ListDetailPane React node.
 */
export function ListDetailPane<T extends { id?: string } = Resource>(props: ListDetailPaneProps<T>): JSX.Element {
  const {
    items,
    loading,
    selectedKey,
    renderItem,
    emptyList,
    skeleton,
    listWidth = DEFAULT_LIST_WIDTH,
    listVisible = true,
    headerText,
    tabs,
    activeTab,
    headerActions,
    selected,
    renderDetail,
    emptyDetail,
    refresh,
    onSelectFirst,
    page,
    pageCount,
    onPageChange,
  } = props;

  // Latest-ref pattern: consumers routinely pass onSelectFirst as an inline arrow, and a
  // changing identity must not refire the auto-select effect (firing on every render
  // would loop with consumers that navigate on select).
  const onSelectFirstRef = useRef(onSelectFirst);
  useEffect(() => {
    onSelectFirstRef.current = onSelectFirst;
  });

  // Auto-select the first item when a load settles with items and no selection intended.
  useEffect(() => {
    if (!loading && selectedKey === undefined && items.length > 0) {
      onSelectFirstRef.current?.(items[0]);
    }
  }, [loading, selectedKey, items]);

  let headerLeft: ReactNode = <span />;
  if (tabs) {
    headerLeft = (
      <Tabs value={activeTab ?? null} variant="unstyled" className={classes.pillTabs}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              // Render the pill itself as the link. Nesting an anchor inside the tab
              // button would leave the pill's padding dead (the anchor stops the click
              // from reaching the button) and is invalid interactive nesting. Mantine's
              // own onClick is dropped: navigation is the link's job, so there is one
              // code path and no tab-change callback to wire up.
              renderRoot={({ onClick: _onClick, className, children, ...rootProps }) => (
                <MedplumLink to={tab.uri} className={cx(classes.tabLink, className)} {...rootProps}>
                  {children}
                </MedplumLink>
              )}
            >
              {tab.label}
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
      <Flex
        direction="column"
        w={listVisible ? listWidth : 0}
        h="100%"
        className={cx(classes.shell, !listVisible && classes.shellHidden)}
        aria-hidden={!listVisible || undefined}
      >
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
          {loading && (skeleton ?? <ListDetailPaneSkeleton />)}
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
