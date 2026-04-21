// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Flex,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import {
  DOSESPOT_MEDICATION_HISTORY_BOT,
  DOSESPOT_PATIENT_SYNC_BOT,
  DOSESPOT_PRESCRIPTIONS_SYNC_BOT,
} from '@medplum/dosespot-react';
import { Loading, useMedplum } from '@medplum/react';
import { SCRIPTSURE_EPRESCRIBING_EXTENSIONS, useScriptSureOrderMedication } from '@medplum/scriptsure-react';
import { IconPlus } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import type { JSX } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { MedTab } from '../../components/meds/MedListItem';
import { MedListItem } from '../../components/meds/MedListItem';
import { MedicationRequestDetails } from '../../components/meds/MedicationRequestDetails';
import { MedSelectEmpty } from '../../components/meds/MedSelectEmpty';
import { PrescriptionIFrameModal } from '../../components/meds/PrescriptionIFrameModal';
import { hasDoseSpotIdentifier } from '../../components/utils';
import { usePatient } from '../../hooks/usePatient';
import { OrderMedicationPage } from '../meds/OrderMedicationPage';
import { showErrorNotification } from '../../utils/notifications';
import classes from './MedsPage.module.css';

export function MedicationsPage(): JSX.Element {
  const { patientId, medicationRequestId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const { orderMedication } = useScriptSureOrderMedication();

  const [activeTab, setActiveTab] = useState<MedTab>('active');
  const [allOrders, setAllOrders] = useState<MedicationRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [newOrderModalOpened, setNewOrderModalOpened] = useState(false);
  const [iframeModalOpened, setIframeModalOpened] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();
  /** MR id for iframe session + polling when URL/detail selection lags behind a new order. */
  const [iframePollMrId, setIframePollMrId] = useState<string | undefined>();
  const [currentOrder, setCurrentOrder] = useState<MedicationRequest | undefined>();

  const patient = usePatient();
  const patientReference = useMemo(() => (patient ? getReferenceString(patient) : undefined), [patient]);
  const membership = medplum.getProjectMembership();
  const hasDoseSpot = hasDoseSpotIdentifier(membership);
  const [syncing, setSyncing] = useState(false);

  const filteredItems = useMemo(() => filterMedicationRequestsByTab(allOrders, activeTab), [allOrders, activeTab]);

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
          '_lastUpdated,status,intent,medicationCodeableConcept,dosageInstruction,dispenseRequest,subject,requester,authoredOn,identifier,extension',
      });
      const results = await medplum.searchResources('MedicationRequest', searchParams, { cache: 'no-cache' });
      setAllOrders(results);
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
    (order: MedicationRequest): string => {
      return `/Patient/${patientId}/MedicationRequest/${order.id}`;
    },
    [patientId]
  );

  useEffect(() => {
    if (!medicationRequestId) {
      setCurrentOrder(undefined);
      return;
    }
    const fromList = allOrders.find((mr) => mr.id === medicationRequestId);
    if (fromList) {
      setCurrentOrder(fromList);
      return;
    }
    medplum
      .readResource('MedicationRequest', medicationRequestId)
      .then(setCurrentOrder)
      .catch(showErrorNotification);
  }, [medicationRequestId, allOrders, medplum]);

  const handleDoseSpotSync = useCallback(async (): Promise<void> => {
    if (!patient?.id) {
      return;
    }
    setSyncing(true);
    const today = new Date().toISOString().split('T')[0];
    try {
      await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, { patientId: patient.id });
      await Promise.all([
        medplum.executeBot(DOSESPOT_PRESCRIPTIONS_SYNC_BOT, { patientId: patient.id, start: today, end: today }),
        medplum.executeBot(DOSESPOT_MEDICATION_HISTORY_BOT, { patientId: patient.id, start: today, end: today }),
      ]);
      showNotification({
        color: 'green',
        icon: '✓',
        title: 'Successfully synced prescriptions and medications with DoseSpot',
        message: '',
      });
      medplum.invalidateSearches('MedicationRequest');
      await fetchData();
    } catch (err) {
      showNotification({
        color: 'red',
        title: 'Error syncing with DoseSpot',
        message: normalizeErrorString(err),
      });
    } finally {
      setSyncing(false);
    }
  }, [medplum, patient, fetchData]);

  const handleOrderMedicationComplete = useCallback(
    async (result: { launchUrl: string; medicationRequestId?: string }): Promise<void> => {
      setNewOrderModalOpened(false);
      setIframePollMrId(result.medicationRequestId);
      setIframeUrl(result.launchUrl);
      setIframeModalOpened(true);
      await fetchData();
      setActiveTab('draft');
      if (result.medicationRequestId && patientId) {
        navigate(`/Patient/${patientId}/MedicationRequest/${result.medicationRequestId}`)?.catch(console.error);
      }
    },
    [fetchData, navigate, patientId]
  );

  const handleOpenScriptSureFromDetails = useCallback(async (): Promise<void> => {
    if (!patientId || !currentOrder?.id) {
      return;
    }
    try {
      const res = await orderMedication({ patientId, medicationRequestId: currentOrder.id });
      setIframePollMrId(currentOrder.id);
      setIframeUrl(res.launchUrl);
      setIframeModalOpened(true);
      await fetchData();
    } catch (e) {
      showErrorNotification(e);
    }
  }, [patientId, currentOrder, orderMedication, fetchData]);

  const refreshLaunchUrl = useCallback(async (): Promise<string | undefined> => {
    const mrId = iframePollMrId ?? currentOrder?.id;
    if (!patientId || !mrId) {
      return iframeUrl;
    }
    const res = await orderMedication({ patientId, medicationRequestId: mrId });
    return res.launchUrl;
  }, [patientId, currentOrder, iframePollMrId, orderMedication, iframeUrl]);

  const handleIframeFhirSynced = useCallback((): void => {
    setIframeModalOpened(false);
    setIframeUrl(undefined);
    setIframePollMrId(undefined);
    fetchData().catch(showErrorNotification);
  }, [fetchData]);

  if (!patient || !patientId) {
    return <Loading />;
  }

  return (
    <Box w="100%" h="100%">
      <Flex h="100%">
        <Box w={350} h="100%">
          <Flex direction="column" h="100%" className={classes.borderRight}>
            <Paper>
              <Flex h={64} align="center" justify="space-between" p="md" wrap="wrap" gap="xs">
                <Group gap="xs">
                  <Tabs value={activeTab} onChange={(v) => setActiveTab((v as MedTab) || 'active')} variant="unstyled" className="pill-tabs">
                    <Tabs.List>
                      <Tabs.Tab value="active">Active</Tabs.Tab>
                      <Tabs.Tab value="draft">Draft</Tabs.Tab>
                      <Tabs.Tab value="completed">Completed</Tabs.Tab>
                    </Tabs.List>
                  </Tabs>
                </Group>
                <Group gap="xs">
                  {hasDoseSpot && (
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={syncing ? <Loader size={14} /> : undefined}
                      disabled={syncing}
                      onClick={() => handleDoseSpotSync().catch(showErrorNotification)}
                    >
                      {syncing ? 'Syncing…' : 'DoseSpot sync'}
                    </Button>
                  )}
                  <Tooltip label="Order medication" position="bottom" openDelay={500}>
                    <ActionIcon
                      radius="xl"
                      variant="filled"
                      color="blue"
                      size={32}
                      aria-label="Order medication"
                      onClick={() => setNewOrderModalOpened(true)}
                    >
                      <IconPlus size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Flex>
            </Paper>
            <Divider />
            <Paper style={{ flex: 1, overflow: 'hidden' }}>
              <ScrollArea h="100%" p="0.5rem">
                {loading && <MedListSkeleton />}
                {!loading && filteredItems.length === 0 && <EmptyMedsState activeTab={activeTab} />}
                {!loading &&
                  filteredItems.length > 0 &&
                  filteredItems.map((item, index) => (
                    <React.Fragment key={item.id}>
                      <MedListItem
                        item={item}
                        selectedItem={currentOrder}
                        activeTab={activeTab}
                        onItemSelect={handleOrderSelect}
                        ePrescribingExtensions={SCRIPTSURE_EPRESCRIBING_EXTENSIONS}
                      />
                      {index < filteredItems.length - 1 && (
                        <Box px="0.5rem">
                          <Divider />
                        </Box>
                      )}
                    </React.Fragment>
                  ))}
              </ScrollArea>
            </Paper>
          </Flex>
        </Box>

        <Box h="100%" style={{ flex: 1 }} className={classes.borderRight}>
          {currentOrder ? (
            <MedicationRequestDetails
              key={currentOrder.id}
              medicationRequest={currentOrder}
              ePrescribingExtensions={SCRIPTSURE_EPRESCRIBING_EXTENSIONS}
              onOpenInScriptSure={() => handleOpenScriptSureFromDetails().catch(showErrorNotification)}
            />
          ) : (
            <MedSelectEmpty />
          )}
        </Box>
      </Flex>

      <Modal opened={newOrderModalOpened} onClose={() => setNewOrderModalOpened(false)} size="xl" centered title="Order medication">
        <OrderMedicationPage
          patient={patient}
          onOrderComplete={(r) => handleOrderMedicationComplete(r).catch(showErrorNotification)}
        />
      </Modal>

      <PrescriptionIFrameModal
        opened={iframeModalOpened}
        onClose={() => {
          setIframeModalOpened(false);
          setIframeUrl(undefined);
          setIframePollMrId(undefined);
          fetchData().catch(showErrorNotification);
        }}
        launchUrl={iframeUrl}
        onRefreshLaunchUrl={iframePollMrId || currentOrder?.id ? refreshLaunchUrl : undefined}
        medicationRequestIdToWatch={iframePollMrId ?? currentOrder?.id}
        onFhirSynced={handleIframeFhirSynced}
        title="Complete prescription"
      />
    </Box>
  );
}

function filterMedicationRequestsByTab(requests: MedicationRequest[], tab: MedTab): MedicationRequest[] {
  const filtered = requests.filter((mr) => {
    const s = mr.status;
    switch (tab) {
      case 'draft':
        return s === 'draft';
      case 'active':
        return s === 'active' || s === 'on-hold' || s === 'unknown';
      case 'completed':
        return s === 'completed' || s === 'stopped' || s === 'cancelled' || s === 'entered-in-error';
      default:
        return false;
    }
  });
  return filtered.sort((a, b) => {
    const aDate = a.meta?.lastUpdated || a.authoredOn;
    const bDate = b.meta?.lastUpdated || b.authoredOn;
    return new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime();
  });
}

function EmptyMedsState({ activeTab }: { activeTab: MedTab }): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center">
      <Stack align="center" gap="md" pt="xl">
        <Text size="md" c="dimmed" fw={400}>
          No {activeTab} medications to display.
        </Text>
      </Stack>
    </Flex>
  );
}

function MedListSkeleton(): JSX.Element {
  const widths = ['72%', '65%', '80%', '70%', '68%', '75%'];
  return (
    <Stack gap="md" p="md">
      {widths.map((w, index) => (
        <Stack key={index}>
          <Flex direction="column" gap="xs" align="flex-start">
            <Skeleton height={16} width={w} />
            <Skeleton height={14} width="55%" />
          </Flex>
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}
