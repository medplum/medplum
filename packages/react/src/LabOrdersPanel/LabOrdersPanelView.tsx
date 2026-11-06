// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Flex, Stack, Text, Tooltip } from '@mantine/core';
import type { SearchRequest, WithId } from '@medplum/core';
import type { DiagnosticReport, ServiceRequest } from '@medplum/fhirtypes';
import { IconPlus } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
import type { ListWithDetailPaneTab, ListWithDetailPaneTabLinkRenderer } from '../ListWithDetailPane/ListWithDetailPane';
import { ListWithDetailPane } from '../ListWithDetailPane/ListWithDetailPane';
import { LabSelectEmpty } from './LabSelectEmpty';

export type LabTab = 'open' | 'completed' | 'revoked';
export type LabItem = WithId<ServiceRequest> | WithId<DiagnosticReport>;

const DEFAULT_COUNT = 20;

/**
 * @param items - The current page of orders or results, searched by the caller.
 * @param total - The total number of items across pages.
 * @param loading - True while the caller is searching.
 * @param search - The normalized search for the active tab (status, sort, count, offset).
 * @param activeTab - The active tab.
 * @param selectedId - The id of the selected order or result.
 * @param selected - The selected item, resolved by the caller.
 * @param onChange - Called with the new search when the page changes.
 * @param completedUri - The URI for the completed tab.
 * @param openUri - The URI for the open tab.
 * @param revokedUri - The URI for the revoked tab.
 * @param renderTabLink - Renders each tab pill as a link through the caller's router.
 * @param renderItem - Renders a list row, wrapped in the caller's link.
 * @param renderDetail - Renders the detail pane for the selected item.
 * @param onOrder - Opens the order form. Omitted: the Order Labs button is hidden.
 */
export interface LabOrdersPanelViewProps {
  readonly items: LabItem[];
  readonly total: number;
  readonly loading: boolean;
  readonly search: SearchRequest;
  readonly activeTab: LabTab;
  readonly selectedId: string | undefined;
  readonly selected: LabItem | undefined;
  readonly onChange: (search: SearchRequest) => void;
  readonly completedUri: string;
  readonly openUri: string;
  readonly revokedUri: string;
  readonly renderTabLink: ListWithDetailPaneTabLinkRenderer;
  readonly renderItem: (item: LabItem, selected: boolean) => ReactNode;
  readonly renderDetail: (item: LabItem) => ReactNode;
  readonly onOrder?: () => void;
}

/**
 * The lab orders panel shell: the tabs, the list, the pagination, and the detail pane. It holds
 * no client and no router: the caller searches, resolves the selection, and renders the rows,
 * the links, and the detail.
 * @param props - The searched items, the selection, and the renderers.
 * @returns The panel.
 */
export function LabOrdersPanelView(props: LabOrdersPanelViewProps): JSX.Element {
  const {
    items,
    total,
    loading,
    search,
    activeTab,
    selectedId,
    selected,
    onChange,
    completedUri,
    openUri,
    revokedUri,
    renderTabLink,
    renderItem,
    renderDetail,
    onOrder,
  } = props;

  const tabs = useMemo<ListWithDetailPaneTab[]>(
    () => [
      { value: 'completed', label: 'Completed', uri: completedUri },
      { value: 'open', label: 'Open', uri: openUri },
      { value: 'revoked', label: 'Revoked', uri: revokedUri },
    ],
    [completedUri, openUri, revokedUri]
  );

  const count = search.count ?? DEFAULT_COUNT;
  const page = Math.floor((search.offset ?? 0) / count) + 1;
  const pageCount = Math.max(1, Math.ceil(total / count));

  const headerActions = onOrder && (
    <Tooltip label="Order Labs" position="bottom" openDelay={500}>
      <ActionIcon radius="xl" variant="filled" color="blue" size={32} aria-label="Order Labs" onClick={onOrder}>
        <IconPlus size={16} />
      </ActionIcon>
    </Tooltip>
  );

  return (
    <Box w="100%" h="100%">
      <ListWithDetailPane<LabItem>
        items={items}
        loading={loading}
        selectedKey={selectedId}
        selected={selected}
        tabs={tabs}
        activeTab={activeTab}
        renderTabLink={renderTabLink}
        headerActions={headerActions}
        emptyList={<EmptyLabsState activeTab={activeTab} />}
        emptyDetail={<LabSelectEmpty />}
        page={page}
        pageCount={pageCount}
        onPageChange={(newPage) => onChange({ ...search, offset: (newPage - 1) * count })}
        renderItem={(item, ctx) => renderItem(item, ctx.selected)}
        renderDetail={(item) => renderDetail(item)}
      />
    </Box>
  );
}

function EmptyLabsState({ activeTab }: { activeTab: LabTab }): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center">
      <Stack align="center" gap="md" pt="xl">
        <Text size="md" c="dimmed" fw={400}>
          No {activeTab} labs to display.
        </Text>
      </Stack>
    </Flex>
  );
}
