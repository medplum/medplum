// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Modal, Stack, Tabs, Tooltip } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { ServiceRequest } from '@medplum/fhirtypes';
import {
  ListDetailLayout,
  ListEmptyState,
  ListScrollArea,
  ListShell,
  ListSkeleton,
  listClasses,
  useMedplum,
} from '@medplum/react';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LabListItem } from '../../components/labs/LabListItem';
import { LabOrderDetails } from '../../components/labs/LabOrderDetails';
import { LabSelectEmpty } from '../../components/labs/LabSelectEmpty';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';
import { OrderLabsPage } from '../labs/OrderLabsPage';

type LabTab = 'open' | 'completed';

export function LabsPage(): JSX.Element {
  const { patientId, serviceRequestId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();

  const [activeTab, setActiveTab] = useState<LabTab>('completed');
  const [openOrders, setOpenOrders] = useState<ServiceRequest[]>([]);
  const [completedOrders, setCompletedOrders] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [newOrderModalOpened, setNewOrderModalOpened] = useState(false);

  const patient = usePatient();
  const patientReference = useMemo(() => (patient ? getReferenceString(patient) : undefined), [patient]);
  const [currentOrder, setCurrentOrder] = useState<ServiceRequest>();

  const fetchOrders = useCallback(async (): Promise<void> => {
    if (!patientReference) {
      showErrorNotification('Patient not found');
      return;
    }
    try {
      const searchParams = new URLSearchParams({
        subject: patientReference,
        _count: '100',
        _sort: '-_lastUpdated',
        _fields:
          '_lastUpdated,code,status,orderDetail,category,subject,requester,performer,requisition,identifier,authoredOn,priority,reasonCode,note,supportingInfo,basedOn',
      });

      const results: ServiceRequest[] = await medplum.searchResources('ServiceRequest', searchParams, {
        cache: 'no-cache',
      });

      setOpenOrders(filterOpenOrders(results));
      setCompletedOrders(filterCompletedOrders(results));
    } catch (error) {
      showErrorNotification(error);
    }
  }, [medplum, patientReference]);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await fetchOrders();
    } finally {
      setLoading(false);
    }
  }, [fetchOrders]);

  useEffect(() => {
    if (patientId) {
      fetchData().catch(showErrorNotification);
    }
  }, [patientId, fetchData]);

  const handleOrderSelect = useCallback(
    (order: ServiceRequest): string => {
      return `/Patient/${patientId}/ServiceRequest/${order.id}`;
    },
    [patientId]
  );

  useEffect(() => {
    const fetchOrder = async (): Promise<void> => {
      if (serviceRequestId) {
        const currentItems = activeTab === 'open' ? openOrders : completedOrders;
        const order = currentItems.find((order: ServiceRequest) => order.id === serviceRequestId);
        if (order) {
          setCurrentOrder(order);
        } else {
          const order = await medplum.readResource('ServiceRequest', serviceRequestId);
          if (order) {
            setCurrentOrder(order);
          }
        }
      } else {
        setCurrentOrder(undefined);
      }
    };
    fetchOrder().catch(showErrorNotification);
  }, [activeTab, openOrders, completedOrders, serviceRequestId, medplum]);

  const handleTabChange = (value: string): void => {
    const newTab = value as LabTab;
    setActiveTab(newTab);
  };

  const handleNewOrderCreated = (): void => {
    setNewOrderModalOpened(false);

    fetchData()
      .then(() => {
        setActiveTab('open');
        navigate(`/Patient/${patientId}/ServiceRequest`)?.catch(console.error);
      })
      .catch(showErrorNotification);
  };

  const currentItems = activeTab === 'completed' ? completedOrders : openOrders;
  const emptyMessage = activeTab === 'completed' ? 'No completed labs to display.' : 'No open labs to display.';

  return (
    <>
      <ListDetailLayout>
        <ListShell
          width={350}
          header={
            <>
              <Group gap="xs">
                <Tabs
                  value={activeTab}
                  onChange={(value) => handleTabChange(value as string)}
                  variant="unstyled"
                  className={listClasses.pillTabs}
                >
                  <Tabs.List>
                    <Tabs.Tab value="completed">Completed</Tabs.Tab>
                    <Tabs.Tab value="open">Open</Tabs.Tab>
                  </Tabs.List>
                </Tabs>
              </Group>
              <Tooltip label="Order Labs" position="bottom" openDelay={500}>
                <ActionIcon
                  radius="xl"
                  variant="filled"
                  color="blue"
                  size={32}
                  onClick={() => setNewOrderModalOpened(true)}
                >
                  <IconPlus size={16} />
                </ActionIcon>
              </Tooltip>
            </>
          }
        >
          <ListScrollArea id="lab-list-scrollarea">
            {loading && <ListSkeleton />}
            {!loading && currentItems.length === 0 && <ListEmptyState message={emptyMessage} />}
            {!loading && currentItems.length > 0 && (
              <Stack gap={2}>
                {currentItems.map((item) => (
                  <LabListItem
                    key={item.id}
                    item={item}
                    selectedItem={currentOrder}
                    activeTab={activeTab}
                    onItemSelect={handleOrderSelect}
                  />
                ))}
              </Stack>
            )}
          </ListScrollArea>
        </ListShell>

        <ListDetailLayout.Column>{renderDetail(currentItems, currentOrder, activeTab)}</ListDetailLayout.Column>
      </ListDetailLayout>

      <Modal
        opened={newOrderModalOpened}
        onClose={() => setNewOrderModalOpened(false)}
        size="xl"
        centered
        title="Order Labs"
      >
        <OrderLabsPage onSubmitLabOrder={handleNewOrderCreated} />
      </Modal>
    </>
  );
}

function renderDetail(
  currentItems: ServiceRequest[],
  currentOrder: ServiceRequest | undefined,
  activeTab: LabTab
): JSX.Element {
  if (currentItems.length === 0) {
    return <LabSelectEmpty activeTab={activeTab} />;
  }
  if (currentOrder) {
    return <LabOrderDetails key={currentOrder.id} order={currentOrder} />;
  }
  return <LabSelectEmpty activeTab={'open'} />;
}

function filterOpenOrders(orders: ServiceRequest[]): ServiceRequest[] {
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

  return filtered.sort((a, b) => {
    const aDate = a.meta?.lastUpdated || a.authoredOn;
    const bDate = b.meta?.lastUpdated || b.authoredOn;
    return new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime();
  });
}

function filterCompletedOrders(orders: ServiceRequest[]): ServiceRequest[] {
  const completedRequisitionNumbers = new Set<string>();
  const filtered = orders.filter((order) => {
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

  return filtered.sort((a, b) => {
    const aDate = a.meta?.lastUpdated || a.authoredOn;
    const bDate = b.meta?.lastUpdated || b.authoredOn;
    return new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime();
  });
}
