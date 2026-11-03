// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Flex, Stack, Text, Tooltip } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { Filter, SearchRequest, WithId } from '@medplum/core';
import { formatSearchQuery, getReferenceString, normalizeErrorString, Operator } from '@medplum/core';
import type { DiagnosticReport, Patient, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconPlus } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ListWithDetailPaneTab } from '../ListWithDetailPane/ListWithDetailPane';
import { ListWithDetailPane } from '../ListWithDetailPane/ListWithDetailPane';
import { LabDetailPane } from './LabDetailPane';
import { LabListItem } from './LabListItem';
import { LabResultListItem } from './LabResultListItem';
import { LabSelectEmpty } from './LabSelectEmpty';

export type LabTab = 'open' | 'completed' | 'revoked';
export type LabItem = WithId<ServiceRequest> | WithId<DiagnosticReport>;

const DEFAULT_COUNT = 20;

export interface LabOrdersPanelOrderModalProps {
  readonly opened: boolean;
  readonly draftOrder: WithId<ServiceRequest> | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

/**
 * LabOrdersPanel lists a patient's lab orders and results, and shows the selected one.
 * It does no routing: the caller derives the search and selection from the URL and navigates.
 * @param patient - The patient whose labs are listed.
 * @param search - The normalized search for the active tab (status, sort, count, offset).
 * @param activeTab - The active tab.
 * @param selectedId - The id of the selected order or result.
 * @param getItemUri - A function to build the URI of a list item.
 * @param onChange - Called with the new search when the page changes.
 * @param completedUri - The URI for the completed tab.
 * @param openUri - The URI for the open tab.
 * @param revokedUri - The URI for the revoked tab.
 * @param onNew - Called after an order is submitted or a draft is saved.
 * @param renderOrderModal - Renders the order modal. Without it, ordering and resuming drafts are hidden.
 */
export interface LabOrdersPanelProps {
  readonly patient: Patient | Reference<Patient> | undefined;
  readonly search: SearchRequest;
  readonly activeTab: LabTab;
  readonly selectedId: string | undefined;
  readonly getItemUri: (item: LabItem) => string;
  readonly onChange: (search: SearchRequest) => void;
  readonly completedUri: string;
  readonly openUri: string;
  readonly revokedUri: string;
  readonly onNew?: () => void;
  readonly renderOrderModal?: (props: LabOrdersPanelOrderModalProps) => ReactNode;
}

export function LabOrdersPanel(props: LabOrdersPanelProps): JSX.Element {
  const {
    patient,
    search,
    activeTab,
    selectedId,
    getItemUri,
    onChange,
    completedUri,
    openUri,
    revokedUri,
    onNew,
    renderOrderModal,
  } = props;
  const medplum = useMedplum();
  const patientReference = patient ? getReferenceString(patient) : undefined;
  const resourceType = activeTab === 'completed' ? 'DiagnosticReport' : 'ServiceRequest';

  const [items, setItems] = useState<LabItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<LabItem>();
  const [loading, setLoading] = useState(false);
  // The order modal is either closed, creating a new order, or resuming a draft.
  const [orderModal, setOrderModal] = useState<'new' | WithId<ServiceRequest>>();

  const fetchData = useCallback(async (): Promise<void> => {
    if (!patientReference) {
      return;
    }
    setLoading(true);
    try {
      const filters: Filter[] = [
        ...(search.filters ?? []),
        { code: 'subject', operator: Operator.EQUALS, value: patientReference },
      ];
      if (activeTab !== 'completed') {
        // A lab order is a top-level ServiceRequest plus one child ServiceRequest
        // per test (basedOn the parent), all sharing a requisition. Listing only
        // top-level requests shows each order once, and keeps the server total
        // (used for pagination) consistent with the rows displayed.
        filters.push({ code: 'based-on', operator: Operator.MISSING, value: 'true' });
      }
      const fetchQuery: SearchRequest = { ...search, filters, total: 'accurate' };
      const results = await medplum.searchResources(resourceType, formatSearchQuery(fetchQuery), {
        cache: 'no-cache',
      });
      setItems(results);
      setTotal(results.bundle?.total ?? results.length);
    } catch (error) {
      showNotification({ color: 'red', message: normalizeErrorString(error) });
    } finally {
      setLoading(false);
    }
  }, [medplum, patientReference, resourceType, search, activeTab]);

  useEffect(() => {
    fetchData().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [fetchData]);

  // Resolve the selected item from the loaded list, falling back to a read.
  useEffect(() => {
    const resolveSelected = async (): Promise<void> => {
      if (!selectedId) {
        setSelected(undefined);
        return;
      }
      const found = items.find((item) => item.id === selectedId);
      if (found) {
        setSelected(found);
        return;
      }
      setSelected(await medplum.readResource(resourceType, selectedId));
    };
    resolveSelected().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [selectedId, items, resourceType, medplum]);

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

  const handleOrderSaved = useCallback((): void => {
    setOrderModal(undefined);
    fetchData()
      .then(() => onNew?.())
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [fetchData, onNew]);

  const headerActions = renderOrderModal && (
    <Tooltip label="Order Labs" position="bottom" openDelay={500}>
      <ActionIcon
        radius="xl"
        variant="filled"
        color="blue"
        size={32}
        aria-label="Order Labs"
        onClick={() => setOrderModal('new')}
      >
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
        headerActions={headerActions}
        emptyList={<EmptyLabsState activeTab={activeTab} />}
        emptyDetail={<LabSelectEmpty />}
        page={page}
        pageCount={pageCount}
        onPageChange={(newPage) => onChange({ ...search, offset: (newPage - 1) * count })}
        renderItem={(item, ctx) =>
          item.resourceType === 'DiagnosticReport' ? (
            <LabResultListItem report={item} selected={ctx.selected} to={getItemUri(item)} />
          ) : (
            <LabListItem
              item={item}
              selectedItem={ctx.selected ? item : undefined}
              activeTab="open"
              onItemSelect={() => getItemUri(item)}
            />
          )
        }
        renderDetail={(item) => (
          <LabDetailPane
            item={item}
            onOrderChange={() =>
              fetchData().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }))
            }
            onResumeOrder={renderOrderModal ? setOrderModal : undefined}
          />
        )}
      />
      {renderOrderModal?.({
        opened: !!orderModal,
        draftOrder: orderModal === 'new' ? undefined : orderModal,
        onClose: () => setOrderModal(undefined),
        onSaved: handleOrderSaved,
      })}
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
