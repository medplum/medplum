// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Flex,
  Paper,
  Group,
  Button,
  Divider,
  ActionIcon,
  ScrollArea,
  Stack,
  Skeleton,
  Text,
  Box,
  Modal,
} from '@mantine/core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { ServiceRequest, DiagnosticReport } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';
import { useNavigate, useParams } from 'react-router';
import { useMedplum } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';
import { IconPlus } from '@tabler/icons-react';
import { LabListItem } from '../../components/labs/LabListItem';
import { LabSelectEmpty } from '../../components/labs/LabSelectEmpty';
import { LabOrderDetails } from '../../components/labs/LabOrderDetails';
import { OrderLabsPage } from '../OrderLabsPage';
import { usePatient } from '../../hooks/usePatient';
import cx from 'clsx';
import classes from './LabsPage.module.css';

type LabTab = 'open' | 'completed';

export function LabsPage(): JSX.Element {
  const { patientId, labId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();

  const [activeTab, setActiveTab] = useState<LabTab>('completed');
  const [openOrders, setOpenOrders] = useState<ServiceRequest[]>([]);
  const [completedOrders, setCompletedOrders] = useState<ServiceRequest[]>([]);
  const [diagnosticReports, setDiagnosticReports] = useState<DiagnosticReport[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [newOrderModalOpened, setNewOrderModalOpened] = useState<boolean>(false);

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

  const fetchDiagnosticReports = useCallback(async (): Promise<void> => {
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
          '_lastUpdated,category,code,status,subject,performer,conclusion,result,basedOn,issued,effectiveDateTime,conclusionCode,presentedForm',
      });

      const results: DiagnosticReport[] = await medplum.searchResources('DiagnosticReport', searchParams, {
        cache: 'no-cache',
      });
      setDiagnosticReports(results);
    } catch (error) {
      showErrorNotification(error);
    }
  }, [medplum, patientReference]);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await Promise.all([fetchOrders(), fetchDiagnosticReports()]);
    } finally {
      setLoading(false);
    }
  }, [fetchOrders, fetchDiagnosticReports]);

  useEffect(() => {
    if (patientId) {
      fetchData().catch(console.error);
    }
  }, [patientId, fetchData]);

  const handleOrderChange = useCallback(
    (order: ServiceRequest): string => {
      return `/Patient/${patientId}/labs/${order.id}`;
    },
    [patientId]
  );

  useEffect(() => {
    const currentItems = activeTab === 'open' ? openOrders : completedOrders;
    const order = currentItems.find((order: ServiceRequest) => order.id === labId);
    setCurrentOrder(order);
  }, [activeTab, openOrders, completedOrders, labId]);

  if (!patientId) {
    return <div>Patient ID is required</div>;
  }

  const handleTabChange = (value: string): void => {
    const newTab = value as LabTab;
    setActiveTab(newTab);
  };

  const handleNewOrderCreated = (): void => {
    setNewOrderModalOpened(false);

    fetchData()
      .then(() => {
        setActiveTab('open');
        navigate(`/Patient/${patientId}/labs`)?.catch(console.error);
      })
      .catch(showErrorNotification);
  };

  const currentItems = activeTab === 'completed' ? completedOrders : openOrders;

  return (
    <Box w="100%" h="100%">
      <Flex h="100%">
        <Box w={350} h="100%">
          <Flex direction="column" h="100%" className={classes.borderRight}>
            <Paper>
              <Flex h={64} align="center" justify="space-between" p="md">
                <Group gap="xs">
                  <Button
                    className={cx(classes.button, { [classes.selected]: activeTab === 'completed' })}
                    h={32}
                    radius="xl"
                    onClick={() => handleTabChange('completed')}
                  >
                    Completed
                  </Button>

                  <Button
                    className={cx(classes.button, { [classes.selected]: activeTab === 'open' })}
                    h={32}
                    radius="xl"
                    onClick={() => handleTabChange('open')}
                  >
                    Open
                  </Button>
                </Group>

                <ActionIcon radius="50%" variant="filled" color="blue" onClick={() => setNewOrderModalOpened(true)}>
                  <IconPlus size={16} />
                </ActionIcon>
              </Flex>
            </Paper>

            <Divider />
            <Paper style={{ flex: 1, overflow: 'hidden' }}>
              <ScrollArea h="100%" id="lab-list-scrollarea" p="0.5rem">
                {loading && <LabListSkeleton />}
                {!loading && currentItems.length === 0 && <EmptyLabsState activeTab={activeTab} />}
                {!loading &&
                  currentItems.length > 0 &&
                  currentItems.map((item, index) => {
                    return (
                      <React.Fragment key={item.id}>
                        <LabListItem
                          item={item}
                          selectedItem={currentOrder}
                          activeTab={activeTab}
                          onItemChange={handleOrderChange}
                        />
                        {index < currentItems.length - 1 && (
                          <Box px="0.5rem">
                            <Divider />
                          </Box>
                        )}
                      </React.Fragment>
                    );
                  })}
              </ScrollArea>
            </Paper>
          </Flex>
        </Box>

        {currentItems.length > 0 ? (
          <>
            <Box
              h="100%"
              style={{
                flex: 1,
              }}
              className={classes.borderRight}
            >
              {currentOrder ? (
                <LabOrderDetails
                  key={currentOrder.id}
                  order={currentOrder}
                  onOrderChange={handleOrderChange}
                  diagnosticReports={diagnosticReports}
                  activeTab={activeTab}
                />
              ) : (
                <LabSelectEmpty activeTab={'open'} />
              )}
            </Box>
          </>
        ) : (
          <Flex direction="column" h="100%" style={{ flex: 1 }}>
            <LabSelectEmpty activeTab={activeTab} />
          </Flex>
        )}
      </Flex>

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
