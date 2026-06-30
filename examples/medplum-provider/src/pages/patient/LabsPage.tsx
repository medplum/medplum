// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Flex, Modal, Stack, Text, Tooltip } from '@mantine/core';
import type { SearchRequest, SortRule, WithId } from '@medplum/core';
import { formatSearchQuery, getReferenceString, Operator, parseSearchRequest } from '@medplum/core';
import type { DiagnosticReport, ServiceRequest } from '@medplum/fhirtypes';
import type { ListWithDetailPaneTab } from '@medplum/react';
import { ListWithDetailPane, useMedplum } from '@medplum/react';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { LabListItem } from '../../components/labs/LabListItem';
import { LabOrderDetails } from '../../components/labs/LabOrderDetails';
import { LabResultDetails } from '../../components/labs/LabResultDetails';
import { LabResultListItem } from '../../components/labs/LabResultListItem';
import { LabSelectEmpty } from '../../components/labs/LabSelectEmpty';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';
import { OrderLabsPage } from '../labs/OrderLabsPage';

type LabTab = 'open' | 'completed';
type LabItem = WithId<ServiceRequest> | WithId<DiagnosticReport>;

// The "Completed" tab lists finalized results; the "Open" tab lists orders that
// have not yet resolved into a result.
const COMPLETED_RESOURCE_TYPE = 'DiagnosticReport';
const OPEN_RESOURCE_TYPE = 'ServiceRequest';
const COMPLETED_REPORT_STATUS = 'final';
const OPEN_ORDER_STATUS = 'active,draft,on-hold';
const DEFAULT_SORT_RULES: SortRule[] = [{ code: '_lastUpdated', descending: true }];
// Page size. Overridable via the URL `_count` param.
const DEFAULT_COUNT = 20;

// Extra fields the Open tab list/detail need beyond the server default.
const OPEN_ORDER_FIELDS = [
  '_lastUpdated',
  'code',
  'status',
  'orderDetail',
  'category',
  'subject',
  'requester',
  'performer',
  'requisition',
  'identifier',
  'authoredOn',
  'priority',
  'reasonCode',
  'note',
  'supportingInfo',
  'basedOn',
];

export function LabsPage(): JSX.Element {
  const { patientId, serviceRequestId, diagnosticReportId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const medplum = useMedplum();

  const patient = usePatient();
  const patientReference = useMemo(() => (patient ? getReferenceString(patient) : undefined), [patient]);

  // Tabs are URL-driven: the DiagnosticReport route is "Completed", the
  // ServiceRequest route is "Open".
  const activeTab: LabTab = location.pathname.includes('/DiagnosticReport') ? 'completed' : 'open';
  const resourceType = activeTab === 'completed' ? COMPLETED_RESOURCE_TYPE : OPEN_RESOURCE_TYPE;
  const selectedId = activeTab === 'completed' ? diagnosticReportId : serviceRequestId;

  const [items, setItems] = useState<LabItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<LabItem>();
  const [loading, setLoading] = useState(false);
  const [newOrderModalOpened, setNewOrderModalOpened] = useState(false);

  // The active search is parsed from the URL query string, then has the tab's
  // default status filter and a default sort applied.
  const search = useMemo(
    () => addDefaultLabSearchValues(parseSearchRequest(`${resourceType}${location.search}`), activeTab),
    [resourceType, location.search, activeTab]
  );

  // Keep the URL in sync with the effective filters/sort. When the URL lacks a
  // sort (or status), this rewrites it to the normalized query (e.g. adds
  // _sort=-_lastUpdated).
  useEffect(() => {
    const normalizedQuery = formatSearchQuery(search);
    if (location.search !== normalizedQuery) {
      navigate(`${location.pathname}${normalizedQuery}`, { replace: true })?.catch(console.error);
    }
  }, [search, location.pathname, location.search, navigate]);

  const fetchData = useCallback(async (): Promise<void> => {
    if (!patientReference) {
      return;
    }
    setLoading(true);
    try {
      const fetchQuery: SearchRequest = {
        ...search,
        filters: [...(search.filters ?? []), { code: 'subject', operator: Operator.EQUALS, value: patientReference }],
        fields: activeTab === 'open' ? OPEN_ORDER_FIELDS : undefined,
        total: 'accurate',
      };
      const results = await medplum.searchResources(resourceType, formatSearchQuery(fetchQuery), {
        cache: 'no-cache',
      });
      setItems(activeTab === 'open' ? dedupeByRequisition(results as WithId<ServiceRequest>[]) : results);
      setTotal(results.bundle?.total ?? results.length);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setLoading(false);
    }
  }, [medplum, patientReference, resourceType, search, activeTab]);

  useEffect(() => {
    if (patientId) {
      fetchData().catch(showErrorNotification);
    }
  }, [patientId, fetchData]);

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
    resolveSelected().catch(showErrorNotification);
  }, [selectedId, items, resourceType, medplum]);

  const tabs: ListWithDetailPaneTab[] = useMemo(() => {
    const completedQuery = formatSearchQuery(
      addDefaultLabSearchValues(parseSearchRequest(COMPLETED_RESOURCE_TYPE), 'completed')
    );
    const openQuery = formatSearchQuery(addDefaultLabSearchValues(parseSearchRequest(OPEN_RESOURCE_TYPE), 'open'));
    return [
      { value: 'completed', label: 'Completed', uri: `/Patient/${patientId}/DiagnosticReport${completedQuery}` },
      { value: 'open', label: 'Open', uri: `/Patient/${patientId}/ServiceRequest${openQuery}` },
    ];
  }, [patientId]);

  const handleTabChange = useCallback(
    (value: string): void => {
      const tab = tabs.find((t) => t.value === value);
      if (tab) {
        navigate(tab.uri)?.catch(console.error);
      }
    },
    [navigate, tabs]
  );

  const count = search.count ?? DEFAULT_COUNT;
  const page = Math.floor((search.offset ?? 0) / count) + 1;
  const pageCount = Math.max(1, Math.ceil(total / count));

  const handlePageChange = useCallback(
    (newPage: number): void => {
      // Navigate to the list (dropping any selected item) with the new offset.
      const nextSearch: SearchRequest = { ...search, offset: (newPage - 1) * (search.count ?? DEFAULT_COUNT) };
      navigate(`/Patient/${patientId}/${resourceType}${formatSearchQuery(nextSearch)}`)?.catch(console.error);
    },
    [search, navigate, patientId, resourceType]
  );

  const handleNewOrderCreated = useCallback((): void => {
    setNewOrderModalOpened(false);
    const openTab = tabs.find((t) => t.value === 'open');
    fetchData()
      .then(() => (openTab ? navigate(openTab.uri)?.catch(console.error) : undefined))
      .catch(showErrorNotification);
  }, [fetchData, navigate, tabs]);

  const headerActions = (
    <Tooltip label="Order Labs" position="bottom" openDelay={500}>
      <ActionIcon
        radius="xl"
        variant="filled"
        color="blue"
        size={32}
        aria-label="Order Labs"
        onClick={() => setNewOrderModalOpened(true)}
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
        refresh={fetchData}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        headerActions={headerActions}
        emptyList={<EmptyLabsState activeTab={activeTab} />}
        emptyDetail={<LabSelectEmpty activeTab={activeTab} />}
        page={page}
        pageCount={pageCount}
        onPageChange={handlePageChange}
        renderItem={(item, ctx) =>
          item.resourceType === 'DiagnosticReport' ? (
            <LabResultListItem
              report={item}
              selected={ctx.selected}
              to={`/Patient/${patientId}/DiagnosticReport/${item.id}${location.search}`}
            />
          ) : (
            <LabListItem
              item={item}
              selectedItem={ctx.selected ? item : undefined}
              activeTab="open"
              onItemSelect={(order) => `/Patient/${patientId}/ServiceRequest/${order.id}${location.search}`}
            />
          )
        }
        renderDetail={(item) => (
          <Box h="100%" style={{ flex: 1, overflow: 'hidden' }}>
            {item.resourceType === 'DiagnosticReport' ? (
              <LabResultDetails key={item.id} result={item} />
            ) : (
              <LabOrderDetails key={item.id} order={item} />
            )}
          </Box>
        )}
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

/**
 * Applies the tab's default status filter and a default sort to a parsed search.
 * Anything already present in the URL (status, sort, count) is preserved.
 * @param search - The search parsed from the URL.
 * @param tab - The active tab, which determines the default status filter.
 * @returns The search with default lab values populated.
 */
function addDefaultLabSearchValues(search: SearchRequest, tab: LabTab): SearchRequest {
  const filters = search.filters ?? [];
  const hasStatus = filters.some((filter) => filter.code === 'status');
  const defaultStatus = tab === 'completed' ? COMPLETED_REPORT_STATUS : OPEN_ORDER_STATUS;
  return {
    ...search,
    filters: hasStatus ? filters : [...filters, { code: 'status', operator: Operator.EQUALS, value: defaultStatus }],
    sortRules: search.sortRules ?? DEFAULT_SORT_RULES,
    count: search.count ?? DEFAULT_COUNT,
  };
}

/**
 * Collapses ServiceRequests that share a requisition number into a single row,
 * keeping the first (most recently updated, since the search is sorted) entry.
 * @param orders - The open ServiceRequests to dedupe.
 * @returns The deduped list of open orders.
 */
function dedupeByRequisition(orders: WithId<ServiceRequest>[]): WithId<ServiceRequest>[] {
  const seenRequisitions = new Set<string>();
  return orders.filter((order) => {
    const requisitionNumber = order.requisition?.value;
    if (!requisitionNumber) {
      return true;
    }
    if (seenRequisitions.has(requisitionNumber)) {
      return false;
    }
    seenRequisitions.add(requisitionNumber);
    return true;
  });
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
