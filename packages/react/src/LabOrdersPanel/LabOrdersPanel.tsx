// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Flex, Stack, Text, Tooltip } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { Filter, SearchRequest, WithId } from '@medplum/core';
import { createReference, formatSearchQuery, getReferenceString, normalizeErrorString, Operator } from '@medplum/core';
import type {
  DiagnosticReport,
  Organization,
  Patient,
  Practitioner,
  Reference,
  Resource,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconPlus } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { renderMedplumLink } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import type {
  ListWithDetailPaneTab,
  ListWithDetailPaneTabLinkRenderer,
} from '../ListWithDetailPane/ListWithDetailPane';
import { ListWithDetailPane } from '../ListWithDetailPane/ListWithDetailPane';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { LabDetailPaneView, useLabDetailPaneOrder } from './LabDetailPane';
import { LabListItemView } from './LabListItem';
import { LabOrderDetailsView, useLabOrderDetailsData } from './LabOrderDetails';
import { LabResultDetailsView, useLabResultDetailsData } from './LabResultDetails';
import { LabResultListItemView } from './LabResultListItem';
import { LabSelectEmpty } from './LabSelectEmpty';

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

const renderMedplumTabLink: ListWithDetailPaneTabLinkRenderer = (uri, { children, ...rest }) => (
  <MedplumLink to={uri} {...rest}>
    {children}
  </MedplumLink>
);

/**
 * The lab orders panel, searching and reading through the Medplum client and linking with
 * MedplumLink.
 * @param props - The patient, the search, the selection, and the URIs.
 * @returns The panel.
 */
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

  // Resolve the requester/performer behind each visible row in a single pass so the list rows
  // can render through the client-free View tier instead of each row re-reading its own person.
  const rowPeople = useRowPeople(items);

  // Resolve the detail pane's data at this level so the panel renders LabDetailPaneView directly,
  // never nesting a client-having wrapper beneath LabOrdersPanelView.
  const { order: resolvedOrder, loading: orderLoading, setOrder: setResolvedOrder } = useLabDetailPaneOrder(selected);
  const selectedReportRef =
    selected?.resourceType === 'DiagnosticReport' ? createReference(selected) : undefined;
  const orderData = useLabOrderDetailsData(resolvedOrder, selectedReportRef);
  const resultData = useLabResultDetailsData(
    selected?.resourceType === 'DiagnosticReport' ? selected : undefined
  );

  const handleOrderSaved = useCallback((): void => {
    setOrderModal(undefined);
    fetchData()
      .then(() => onNew?.())
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [fetchData, onNew]);

  const refetch = useCallback((): void => {
    fetchData().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [fetchData]);

  return (
    <>
      <LabOrdersPanelView
        items={items}
        total={total}
        loading={loading}
        search={search}
        activeTab={activeTab}
        selectedId={selectedId}
        selected={selected}
        onChange={onChange}
        completedUri={completedUri}
        openUri={openUri}
        revokedUri={revokedUri}
        renderTabLink={renderMedplumTabLink}
        renderItem={(item, isSelected) => (
          <MedplumLink to={getItemUri(item)} underline="never">
            {item.resourceType === 'DiagnosticReport' ? (
              <LabResultListItemView
                report={item}
                selected={isSelected}
                performer={rowPeople.get(item.performer?.[0]?.reference ?? '') as Practitioner | Organization | undefined}
              />
            ) : (
              <LabListItemView
                item={item}
                selected={isSelected}
                activeTab={activeTab === 'completed' ? 'completed' : 'open'}
                requester={rowPeople.get(item.requester?.reference ?? '') as Practitioner | undefined}
              />
            )}
          </MedplumLink>
        )}
        renderDetail={(item) => (
          <LabDetailPaneView
            item={item}
            order={resolvedOrder}
            loading={orderLoading}
            renderOrder={(current, selectedReport) => (
              <LabOrderDetailsView
                order={current}
                patient={orderData.patient}
                requester={orderData.requester}
                report={orderData.report}
                reportLoading={orderData.reportLoading}
                reportAttachments={orderData.reportAttachments}
                reportResources={orderData.reportResources}
                requisitionDocuments={orderData.requisitionDocuments}
                requisitionDocumentsLoading={orderData.requisitionDocumentsLoading}
                specimenLabelDocuments={orderData.specimenLabelDocuments}
                specimenLabelDocumentsLoading={orderData.specimenLabelDocumentsLoading}
                questionnaireResponse={orderData.questionnaireResponse}
                defaultTab={selectedReport ? 'report' : undefined}
                onRevoke={() =>
                  orderData
                    .revoke()
                    .then((updated) => {
                      setResolvedOrder(updated);
                      refetch();
                    })
                    .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }))
                }
                onResume={renderOrderModal ? () => setOrderModal(current) : undefined}
                renderLink={renderMedplumLink}
              />
            )}
            renderResult={(result) => (
              <LabResultDetailsView
                result={result}
                attachments={resultData.attachments}
                resources={resultData.resources}
                renderLink={renderMedplumLink}
              />
            )}
          />
        )}
        onOrder={renderOrderModal ? () => setOrderModal('new') : undefined}
      />
      {renderOrderModal?.({
        opened: !!orderModal,
        draftOrder: orderModal === 'new' ? undefined : orderModal,
        onClose: () => setOrderModal(undefined),
        onSaved: handleOrderSaved,
      })}
    </>
  );
}

/**
 * Resolves the requester (for ServiceRequests) or performer (for DiagnosticReports) behind each
 * visible row, in a single batch of reads. Returns a map keyed by the resource's reference string.
 * @param items - The current page of rows.
 * @returns A map from reference string to resolved person.
 */
function useRowPeople(items: LabItem[]): Map<string, Resource> {
  const medplum = useMedplum();
  const refs = useMemo(() => {
    const unique = new Set<string>();
    for (const item of items) {
      const ref =
        item.resourceType === 'ServiceRequest'
          ? item.requester?.reference
          : item.performer?.[0]?.reference;
      if (ref) {
        unique.add(ref);
      }
    }
    return Array.from(unique);
  }, [items]);

  const [people, setPeople] = useState<Map<string, Resource>>(new Map());

  useEffect(() => {
    if (refs.length === 0) {
      setPeople(new Map());
      return undefined;
    }
    let cancelled = false;
    Promise.all(
      refs.map((reference) =>
        medplum.readReference({ reference }).then(
          (resource) => [reference, resource] as const,
          () => undefined
        )
      )
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }
        const map = new Map<string, Resource>();
        for (const entry of entries) {
          if (entry) {
            map.set(entry[0], entry[1]);
          }
        }
        setPeople(map);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [medplum, refs]);

  return people;
}

export type LabTab = 'open' | 'completed' | 'revoked';
export type LabItem = WithId<ServiceRequest> | WithId<DiagnosticReport>;

const DEFAULT_COUNT = 20;

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
