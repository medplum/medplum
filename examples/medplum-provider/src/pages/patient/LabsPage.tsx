// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Divider, Flex, Modal, Skeleton, Stack, Text, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { DiagnosticReport, Resource, ResourceType, ServiceRequest } from '@medplum/fhirtypes';
import type { ListWithDetailPaneTab } from '@medplum/react';
import { ListWithDetailPane, useMedplum } from '@medplum/react';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { LabListItem } from '../../components/labs/LabListItem';
import { LabOrderDetails } from '../../components/labs/LabOrderDetails';
import { LabResultDetails } from '../../components/labs/LabResultDetails';
import { LabResultListItem } from '../../components/labs/LabResultListItem';
import { LabSelectEmpty } from '../../components/labs/LabSelectEmpty';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';
import { OrderLabsPage } from '../labs/OrderLabsPage';

type LabTab = 'open' | 'completed';

/** A lab list row is either an order (ServiceRequest) or a result (DiagnosticReport). */
type LabItem = WithId<ServiceRequest> | WithId<DiagnosticReport>;

/** Client-side page size. We fetch the full set and dedupe, then paginate the result locally. */
const PAGE_SIZE = 20;

/** How many resources to pull per fetch round-trip while paging through the full set. */
const FETCH_PAGE_SIZE = 200;
/** Safety ceiling so an unexpectedly huge patient can't trigger an unbounded fetch loop. */
const MAX_FETCH = 2000;

export function LabsPage(): JSX.Element {
  const { patientId, serviceRequestId, diagnosticReportId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();

  // The tab lives in the URL (the sidebar tabs are links). The selection lives in the path:
  // either a ServiceRequest/:id (order) or a DiagnosticReport/:id (result).
  const [searchParams] = useSearchParams();
  const activeTab: LabTab = searchParams.get('status') === 'open' ? 'open' : 'completed';
  const selectedId = serviceRequestId ?? diagnosticReportId;

  const [openOrders, setOpenOrders] = useState<WithId<ServiceRequest>[]>([]);
  const [completedItems, setCompletedItems] = useState<LabItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newOrderModalOpened, setNewOrderModalOpened] = useState(false);
  // Pagination is client-side over the deduped list. The page is scoped to a tab so switching
  // tabs lands on page 1 without a reset effect (derive the effective page during render).
  const [pageState, setPageState] = useState<{ tab: LabTab; page: number }>({ tab: activeTab, page: 1 });
  const page = pageState.tab === activeTab ? pageState.page : 1;
  const setPage = (next: number): void => setPageState({ tab: activeTab, page: next });
  // Selection that isn't in the current list (e.g. deep-linked, or on another page).
  const [fetchedItem, setFetchedItem] = useState<LabItem | undefined>();

  const patient = usePatient();
  const patientReference = useMemo(() => (patient ? getReferenceString(patient) : undefined), [patient]);

  const fetchData = useCallback(async (): Promise<void> => {
    if (!patientReference) {
      showErrorNotification('Patient not found');
      return;
    }
    setLoading(true);
    try {
      // Fetch every order + result for the patient via one cross-type search (`subject` is a
      // shared search param for both types), paging through all results. We can't use `_total`
      // here — it's broken for `_type` (UNION) searches on the server — and the open/completed
      // split plus the requisition/based-on dedup need the full set anyway, so pagination is
      // done client-side over the deduped list.
      const all: WithId<Resource>[] = [];
      for (let offset = 0; offset < MAX_FETCH; offset += FETCH_PAGE_SIZE) {
        const pageResults = await medplum.searchResources(
          '' as ResourceType,
          new URLSearchParams({
            _type: 'ServiceRequest,DiagnosticReport',
            subject: patientReference,
            _count: String(FETCH_PAGE_SIZE),
            _offset: String(offset),
            _sort: '-_lastUpdated',
          }),
          { cache: 'no-cache' }
        );
        all.push(...pageResults);
        if (pageResults.length < FETCH_PAGE_SIZE) {
          break;
        }
      }

      const requests = all.filter((r): r is WithId<ServiceRequest> => r.resourceType === 'ServiceRequest');
      const reports = all.filter((r): r is WithId<DiagnosticReport> => r.resourceType === 'DiagnosticReport');

      setOpenOrders(filterOpenOrders(requests));
      setCompletedItems(buildCompletedItems(requests, reports));
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setLoading(false);
    }
  }, [medplum, patientReference]);

  useEffect(() => {
    if (patientId) {
      fetchData().catch(showErrorNotification);
    }
  }, [patientId, fetchData]);

  const allItems = useMemo(() => [...openOrders, ...completedItems], [openOrders, completedItems]);
  const itemFromList = useMemo(
    () => (selectedId ? allItems.find((item) => item.id === selectedId) : undefined),
    [selectedId, allItems]
  );
  const currentItem = selectedId
    ? (itemFromList ?? (fetchedItem?.id === selectedId ? fetchedItem : undefined))
    : undefined;

  // Resolve a selection that isn't in the loaded list by reading it directly.
  useEffect(() => {
    let cancelled = false;
    if (!itemFromList) {
      if (serviceRequestId) {
        medplum
          .readResource('ServiceRequest', serviceRequestId)
          .then((resource) => !cancelled && setFetchedItem(resource))
          .catch(showErrorNotification);
      } else if (diagnosticReportId) {
        medplum
          .readResource('DiagnosticReport', diagnosticReportId)
          .then((resource) => !cancelled && setFetchedItem(resource))
          .catch(showErrorNotification);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [serviceRequestId, diagnosticReportId, itemFromList, medplum]);

  const getServiceRequestUrl = useCallback(
    // Keep the active tab in the URL so selecting an order doesn't reset the list to the default tab.
    (order: ServiceRequest): string => `/Patient/${patientId}/ServiceRequest/${order.id}?status=${activeTab}`,
    [patientId, activeTab]
  );

  const getDiagnosticReportUrl = useCallback(
    // Results only appear in the Completed tab, so always land there.
    (report: DiagnosticReport): string => `/Patient/${patientId}/DiagnosticReport/${report.id}?status=completed`,
    [patientId]
  );

  // The sidebar tabs render as links; this drives the actual SPA navigation on click
  // (the link href only powers right/cmd-click), mirroring ResourceBoard.
  const handleTabChange = (value: string): void => {
    navigate(`/Patient/${patientId}/ServiceRequest?status=${value}`)?.catch(console.error);
  };

  const handleNewOrderCreated = (): void => {
    setNewOrderModalOpened(false);
    fetchData()
      .then(() => {
        navigate(`/Patient/${patientId}/ServiceRequest?status=open`)?.catch(console.error);
      })
      .catch(showErrorNotification);
  };

  const currentList = activeTab === 'completed' ? completedItems : openOrders;
  const pageCount = Math.max(1, Math.ceil(currentList.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = currentList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const basePath = `/Patient/${patientId}/ServiceRequest`;
  const tabs: ListWithDetailPaneTab[] = [
    { value: 'completed', label: 'Completed', uri: `${basePath}?status=completed` },
    { value: 'open', label: 'Open', uri: `${basePath}?status=open` },
  ];

  const headerActions = (
    <Tooltip label="Order Labs" position="bottom" openDelay={500}>
      <ActionIcon radius="xl" variant="filled" color="blue" size={32} onClick={() => setNewOrderModalOpened(true)}>
        <IconPlus size={16} />
      </ActionIcon>
    </Tooltip>
  );

  return (
    <Box w="100%" h="100%">
      <ListWithDetailPane<LabItem>
        items={pageItems}
        loading={loading}
        renderItem={(item) =>
          item.resourceType === 'ServiceRequest' ? (
            <LabListItem
              item={item}
              selectedItem={currentItem?.resourceType === 'ServiceRequest' ? currentItem : undefined}
              activeTab={activeTab}
              onItemSelect={getServiceRequestUrl}
            />
          ) : (
            <LabResultListItem
              item={item}
              selectedItem={currentItem?.resourceType === 'DiagnosticReport' ? currentItem : undefined}
              onItemSelect={getDiagnosticReportUrl}
            />
          )
        }
        emptyList={<EmptyLabsState activeTab={activeTab} />}
        skeleton={<LabListSkeleton />}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        headerActions={headerActions}
        selected={currentItem}
        renderDetail={(item) => (
          <Box h="100%" style={{ flex: 1, overflow: 'hidden' }}>
            {item.resourceType === 'ServiceRequest' ? (
              <LabOrderDetails key={item.id} order={item} />
            ) : (
              <LabResultDetails key={item.id} result={item} />
            )}
          </Box>
        )}
        emptyDetail={<LabSelectEmpty activeTab={activeTab} />}
        refresh={fetchData}
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
      />

      {/* New Order Modal */}
      <Modal
        opened={newOrderModalOpened}
        onClose={() => setNewOrderModalOpened(false)}
        size="xl"
        centered
        title="Order Labs"
      >
        <OrderLabsPage onSubmitLabOrder={handleNewOrderCreated} />
      </Modal>
    </Box>
  );
}

function filterOpenOrders(orders: WithId<ServiceRequest>[]): WithId<ServiceRequest>[] {
  const filteredOutStatuses = ['completed', 'draft', 'entered-in-error'];
  const completedServiceRequestIds = new Set<string>();
  orders.forEach((order) => {
    if (order.status === 'completed' && order.id) {
      completedServiceRequestIds.add(order.id);
    }
  });

  const completedRequisitionNumbers = new Set<string>();
  const filtered = orders.filter((order) => {
    if (filteredOutStatuses.includes(order.status || '')) {
      return false;
    }

    if (order.basedOn) {
      const basedOnCompleted = order.basedOn.find((basedOn) => {
        if (basedOn.reference?.startsWith('ServiceRequest/')) {
          const [, id] = basedOn.reference.split('/');
          return completedServiceRequestIds.has(id);
        }
        return false;
      });
      if (basedOnCompleted) {
        return false;
      }
    }

    const requisitionNumber = order.requisition?.value;
    if (requisitionNumber && completedRequisitionNumbers.has(requisitionNumber)) {
      return false;
    }

    if (requisitionNumber) {
      completedRequisitionNumbers.add(requisitionNumber);
    }

    return true;
  });

  return filtered.sort((a, b) => getItemTime(b) - getItemTime(a));
}

function filterCompletedOrders(orders: WithId<ServiceRequest>[]): WithId<ServiceRequest>[] {
  const completedRequisitionNumbers = new Set<string>();
  return orders.filter((order) => {
    if (order.status !== 'completed') {
      return false;
    }

    const requisitionNumber = order.requisition?.value;
    if (requisitionNumber && completedRequisitionNumbers.has(requisitionNumber)) {
      return false;
    }

    if (requisitionNumber) {
      completedRequisitionNumbers.add(requisitionNumber);
    }

    return true;
  });
}

// Build the Completed tab list from completed orders plus lab results, sorted by date.
// A result hides the order it is based-on, so a completed order and its report don't both appear.
function buildCompletedItems(orders: WithId<ServiceRequest>[], reports: WithId<DiagnosticReport>[]): LabItem[] {
  const reportedServiceRequestIds = new Set<string>();
  for (const report of reports) {
    for (const basedOn of report.basedOn ?? []) {
      if (basedOn.reference?.startsWith('ServiceRequest/')) {
        reportedServiceRequestIds.add(basedOn.reference.split('/')[1]);
      }
    }
  }

  const completedOrders = filterCompletedOrders(orders).filter(
    (order) => !(order.id && reportedServiceRequestIds.has(order.id))
  );

  return [...completedOrders, ...reports].sort((a, b) => getItemTime(b) - getItemTime(a));
}

function getItemTime(item: ServiceRequest | DiagnosticReport): number {
  const date =
    item.resourceType === 'DiagnosticReport'
      ? item.issued || item.effectiveDateTime || item.meta?.lastUpdated
      : item.meta?.lastUpdated || item.authoredOn;
  return date ? new Date(date).getTime() : 0;
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

function LabListSkeleton(): JSX.Element {
  return (
    <Stack gap="md" p="md">
      {Array.from({ length: 6 }).map((_, index) => (
        <Stack key={index}>
          <Flex direction="column" gap="xs" align="flex-start">
            <Skeleton height={16} width={`${Math.random() * 40 + 60}%`} />
            <Skeleton height={14} width={`${Math.random() * 50 + 40}%`} />
            <Skeleton height={14} width={`${Math.random() * 50 + 40}%`} />
          </Flex>
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}
