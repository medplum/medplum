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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { JSX } from 'react';
import cx from 'clsx';
import classes from './LabsPage.module.css';
import type { ServiceRequest, DiagnosticReport } from '@medplum/fhirtypes';
import { createReference, getReferenceString } from '@medplum/core';
import { useNavigate, useParams } from 'react-router';
import { useMedplum, useResource } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';
import { IconPlus } from '@tabler/icons-react';
import { LabListItem } from '../../components/labs/LabListItem';
import { LabSelectEmpty } from '../../components/labs/LabSelectEmpty';
import { LabOrderDetails } from '../../components/labs/LabOrderDetails';
import { OrderLabsPage } from '../OrderLabsPage';

type LabTab = 'open' | 'completed';

export function LabsPage(): JSX.Element {
  const { patientId, labId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();
  
  const [activeTab, setActiveTab] = useState<LabTab>('completed');
  const [orders, setOrders] = useState<ServiceRequest[]>([]);
  const [diagnosticReports, setDiagnosticReports] = useState<DiagnosticReport[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ServiceRequest | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [newOrderModalOpened, setNewOrderModalOpened] = useState<boolean>(false);
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTabChangingRef = useRef<boolean>(false);
  
  const patient = useResource({ resourceType: 'Patient', id: patientId });
  const patientRef = useMemo(() => (patient ? createReference(patient) : undefined), [patient]);

  // Filter orders based on status according to the requirements
  const openOrders = useMemo(() => {
    // Filter out completed, draft, and entered-in-error statuses (matching PatientSummary logic)
    const filteredOutStatuses = ['completed', 'draft', 'entered-in-error'];
    
    // Create a set of ServiceRequest IDs that have completed versions
    const completedServiceRequestIds = new Set<string>();
    orders.forEach((order) => {
      if (order.status === 'completed' && order.id) {
        completedServiceRequestIds.add(order.id);
      }
    });
    
    // Filter out ServiceRequests that are based on completed ServiceRequests
    // and filter out ServiceRequests with duplicate requisition numbers
    const completedRequisitionNumbers = new Set<string>();
    const filtered = orders.filter((order) => {
      // Filter out completed, draft, and entered-in-error statuses
      if (filteredOutStatuses.includes(order.status || '')) {
        return false;
      }
      
      // If the ServiceRequest is based on a completed ServiceRequest, skip it
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
      
      // Filter out ServiceRequests with duplicate requisition numbers
      const requisitionNumber = order.requisition?.value;
      if (requisitionNumber && completedRequisitionNumbers.has(requisitionNumber)) {
        return false;
      }
      
      // Add this requisition number to the set if it exists
      if (requisitionNumber) {
        completedRequisitionNumbers.add(requisitionNumber);
      }
      
      return true;
    });
    
    
    return filtered.sort((a, b) => {
      // Sort by most recent first using meta.lastUpdated or authoredOn
      const aDate = a.meta?.lastUpdated || a.authoredOn;
      const bDate = b.meta?.lastUpdated || b.authoredOn;
      return new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime();
    });
  }, [orders]);

  const completedOrders = useMemo(() => {
    // Filter out ServiceRequests with duplicate requisition numbers for completed orders
    const completedRequisitionNumbers = new Set<string>();
    const filtered = orders.filter((order) => {
      if (order.status !== 'completed') {
        return false;
      }
      
      // Filter out ServiceRequests with duplicate requisition numbers
      const requisitionNumber = order.requisition?.value;
      if (requisitionNumber && completedRequisitionNumbers.has(requisitionNumber)) {
        return false;
      }
      
      // Add this requisition number to the set if it exists
      if (requisitionNumber) {
        completedRequisitionNumbers.add(requisitionNumber);
      }
      
      return true;
    });
    
    return filtered.sort((a, b) => {
      // Sort by most recent first using meta.lastUpdated or authoredOn
      const aDate = a.meta?.lastUpdated || a.authoredOn;
      const bDate = b.meta?.lastUpdated || b.authoredOn;
      return new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime();
    });
  }, [orders]);

  const fetchOrders = useCallback(async (): Promise<void> => {
    if (!patientRef) {
      return;
    }
    
    try {
      // Use the same approach as PatientSummary
      const ref = getReferenceString(patientRef);
      
      const searchParams = new URLSearchParams({
        subject: ref,
        _count: '100', // Ensure we get all results
        _sort: '-_lastUpdated',
        _fields: '_lastUpdated,code,status,orderDetail,category,subject,requester,performer,requisition,identifier,authoredOn,priority,reasonCode,note,supportingInfo,basedOn',
      });
      
      const results: ServiceRequest[] = await medplum.searchResources('ServiceRequest', searchParams, { cache: 'no-cache' });
      
      setOrders(results);
    } catch (error) {
      showErrorNotification(error);
    }
  }, [medplum, patientRef]);

  const fetchDiagnosticReports = useCallback(async (): Promise<void> => {
    if (!patientRef) {
      return;
    }
    
    try {
      // Use the same approach as PatientSummary
      const ref = getReferenceString(patientRef);
      
      const searchParams = new URLSearchParams({
        subject: ref,
        _count: '100', // Ensure we get all results
        _sort: '-_lastUpdated',
        _fields: '_lastUpdated,category,code,status,subject,performer,conclusion,result,basedOn,issued,effectiveDateTime,conclusionCode,presentedForm',
      });
      
      const results: DiagnosticReport[] = await medplum.searchResources('DiagnosticReport', searchParams, { cache: 'no-cache' });
      setDiagnosticReports(results);
    } catch (error) {
      showErrorNotification(error);
    }
  }, [medplum, patientRef]);

  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await Promise.all([fetchOrders(), fetchDiagnosticReports()]);
    } finally {
      setLoading(false);
    }
  }, [fetchOrders, fetchDiagnosticReports]);

  const handleOrderChange = useCallback((order: ServiceRequest): void => {
    navigate(`/Patient/${patientId}/labs/${order.id}`)?.catch(console.error);
  }, [navigate, patientId]);



  useEffect(() => {
    fetchData().catch(console.error);
  }, [fetchData]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, []);

  // Auto-select first item when data loads, tab changes, or when no labId is present
  useEffect(() => {
    // Clear any existing timeout
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
      selectionTimeoutRef.current = null;
    }

    const currentItems = activeTab === 'completed' ? completedOrders : openOrders;
    const currentSelectedItem = selectedOrder;
    
    // Auto-select first item if we have items, no current selection, and no labId in URL
    // Skip if we're in the middle of a tab change to prevent interference
    if (currentItems.length > 0 && !currentSelectedItem && !labId && !isTabChangingRef.current) {
      const firstItem = currentItems[0];
      handleOrderChange(firstItem as ServiceRequest);
    }

    // Set a fallback timeout to ensure selection happens even if there are timing issues
    const timeoutId = setTimeout(() => {
      const currentItemsFallback = activeTab === 'completed' ? completedOrders : openOrders;
      const currentSelectedItemFallback = selectedOrder;
      
      if (currentItemsFallback.length > 0 && !currentSelectedItemFallback && !labId && !isTabChangingRef.current) {
        const firstItem = currentItemsFallback[0];
        handleOrderChange(firstItem as ServiceRequest);
      }
    }, 100);

    selectionTimeoutRef.current = timeoutId;

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [openOrders, completedOrders, activeTab, selectedOrder, labId, handleOrderChange]);

  useEffect(() => {
    const handleSelection = async (): Promise<void> => {
      if (labId) {
        // Both tabs now show ServiceRequests, so we always look for ServiceRequest
        const order = orders.find((order: ServiceRequest) => order.id === labId);
        if (order) {
          setSelectedOrder(order);
        } else {
          try {
            const order = await medplum.readResource('ServiceRequest', labId);
            setSelectedOrder(order);
          } catch {
            setSelectedOrder(undefined);
          }
        }
      } else {
        setSelectedOrder(undefined);
      }
    };

    handleSelection().catch(() => {
      setSelectedOrder(undefined);
    });
  }, [labId, orders, medplum]);

  // Compute selectedItem with optimistic first-item selection (must be before early return)
  // This ensures first item appears selected immediately when tab loads
  const selectedItem = useMemo(() => {
    // Both tabs now show ServiceRequests, so we always return selectedOrder
    if (selectedOrder) {
      return selectedOrder;
    }
    // Optimistically select first order if available and no labId
    const currentItems = activeTab === 'open' ? openOrders : completedOrders;
    return currentItems.length > 0 && !labId ? currentItems[0] : undefined;
  }, [activeTab, selectedOrder, openOrders, completedOrders, labId]);

  if (!patientId) {
    return <div>Patient ID is required</div>;
  }

  const handleTabChange = (value: string): void => {
    const newTab = value as LabTab;
    
    // Set flag to prevent auto-selection interference
    isTabChangingRef.current = true;
    
    // Get items for the new tab BEFORE changing the active tab
    const currentItems = newTab === 'completed' ? completedOrders : openOrders;
    
    if (currentItems.length > 0) {
      const firstItem = currentItems[0];
      
      // Use flushSync to ensure all state updates happen synchronously
      // This prevents any visual flashing by ensuring consistent state
      flushSync(() => {
        setSelectedOrder(firstItem as ServiceRequest);
        setActiveTab(newTab);
      });
      
      // Navigate after state is updated
      navigate(`/Patient/${patientId}/labs/${firstItem.id}`)?.catch(console.error);
    } else {
      // No items available, just switch tab
      flushSync(() => {
        setActiveTab(newTab);
        setSelectedOrder(undefined);
      });
      navigate(`/Patient/${patientId}/labs`)?.catch(console.error);
    }
    
    // Reset flag after a brief delay to allow state updates to complete
    setTimeout(() => {
      isTabChangingRef.current = false;
    }, 50);
  };

  const handleItemChange = (item: ServiceRequest): void => {
    handleOrderChange(item);
  };

  const handleNewOrderCreated = (): void => {
    setNewOrderModalOpened(false);
    
    // Add a small delay to ensure the new order is fully created and indexed
    setTimeout(() => {
      fetchData().then(() => {
        // Switch to Open tab - the existing auto-selection logic will handle selecting the first item
        flushSync(() => {
          setActiveTab('open');
          setSelectedOrder(undefined); // Clear selection to trigger auto-selection
        });
        
        // Navigate to the labs page without a specific ID to trigger auto-selection
        navigate(`/Patient/${patientId}/labs`)?.catch(console.error);
      }).catch(showErrorNotification);
    }, 500); // 500ms delay to ensure order is created
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

                <ActionIcon 
                  radius="50%" 
                  variant="filled" 
                  color="blue" 
                  onClick={() => setNewOrderModalOpened(true)}
                >
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
                    // Ensure first item is treated as selected if no explicit selection exists
                    const effectiveSelectedItem = selectedItem || (index === 0 ? item : undefined);
                    return (
                      <React.Fragment key={item.id}>
                        <LabListItem 
                          item={item} 
                          selectedItem={effectiveSelectedItem} 
                          activeTab={activeTab}
                          onItemChange={handleItemChange}
                        />
                        {index < currentItems.length - 1 && (
                          <Box px="0.5rem">
                            <Divider color="var(--mantine-color-gray-1)" />
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
              {selectedItem ? (
                <>
                  {activeTab === 'completed' && selectedOrder && (
                    <LabOrderDetails key={selectedOrder.id} order={selectedOrder} onOrderChange={handleOrderChange} diagnosticReports={diagnosticReports} activeTab={activeTab} />
                  )}
                  {activeTab === 'open' && selectedOrder && (
                    <LabOrderDetails key={selectedOrder.id} order={selectedOrder} onOrderChange={handleOrderChange} diagnosticReports={diagnosticReports} activeTab={activeTab} />
                  )}
                </>
              ) : (
                // Fallback: show first item even if not properly selected
                <>
                  {currentItems[0] && (
                    <LabOrderDetails key={(currentItems[0] as ServiceRequest).id} order={currentItems[0] as ServiceRequest} onOrderChange={handleOrderChange} diagnosticReports={diagnosticReports} activeTab={activeTab} />
                  )}
                </>
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
      <Modal opened={newOrderModalOpened} onClose={() => setNewOrderModalOpened(false)} size="xl" centered title="Order Labs">
        <OrderLabsPage onSubmitLabOrder={handleNewOrderCreated} />
      </Modal>

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
