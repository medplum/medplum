// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Box,
  Divider,
  Flex,
  Group,
  Modal,
  Pagination,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import { hideNotification, showNotification, updateNotification } from '@mantine/notifications';
import { getReferenceString } from '@medplum/core';
import {
  DOSESPOT_MEDICATION_HISTORY_BOT,
  DOSESPOT_PATIENT_SYNC_BOT,
  DOSESPOT_PRESCRIPTIONS_SYNC_BOT,
} from '@medplum/dosespot-react';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import {
  SCRIPTSURE_IFRAME_BOT,
  SCRIPTSURE_MEDICATION_ORDER_EXTENSIONS,
  useScriptSureOrderMedication,
} from '@medplum/scriptsure-react';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { MedicationRequestDetails } from '../../components/meds/MedicationRequestDetails';
import type { MedTab } from '../../components/meds/MedListItem';
import { MedListItem } from '../../components/meds/MedListItem';
import { MedSelectEmpty } from '../../components/meds/MedSelectEmpty';
import { PrescriptionIFrameModal } from '../../components/meds/PrescriptionIFrameModal';
import { hasDoseSpotIdentifier, hasScriptSureIdentifier } from '../../components/utils';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';
import { OrderMedicationPage } from '../meds/OrderMedicationPage';
import classes from './MedsPage.module.css';

/** Server-side _count for the medication list page. */
const PAGE_SIZE = 20;

/**
 * FHIR `MedicationRequest.status` filter for each UI tab. Comma-OR semantics
 * follow the FHIR search spec ("multipleOr") so we get a single round-trip
 * per tab regardless of how many backing statuses we lump together.
 */
const TAB_TO_STATUS_PARAM: Record<MedTab, string> = {
  active: 'active,on-hold,unknown',
  draft: 'draft',
  completed: 'completed,stopped,cancelled,entered-in-error',
};

const STATUS_PARAM_TO_TAB: Record<string, MedTab> = {
  'active,on-hold,unknown': 'active',
  draft: 'draft',
  'completed,stopped,cancelled,entered-in-error': 'completed',
};

const DEFAULT_TAB: MedTab = 'active';

export function MedicationsPage(): JSX.Element {
  const { patientId, medicationRequestId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const { orderMedication } = useScriptSureOrderMedication();

  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status') ?? TAB_TO_STATUS_PARAM[DEFAULT_TAB];
  const activeTab: MedTab = STATUS_PARAM_TO_TAB[statusParam] ?? DEFAULT_TAB;
  const offset = Math.max(0, Number.parseInt(searchParams.get('_offset') ?? '0', 10) || 0);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const setTab = useCallback(
    (next: MedTab) => {
      const status = TAB_TO_STATUS_PARAM[next];
      // Reset paging on tab change so the user lands on page 1 of the new status set.
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          updated.set('status', status);
          updated.delete('_offset');
          return updated;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setPage = useCallback(
    (page: number) => {
      const nextOffset = Math.max(0, (page - 1) * PAGE_SIZE);
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          if (nextOffset === 0) {
            updated.delete('_offset');
          } else {
            updated.set('_offset', String(nextOffset));
          }
          return updated;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [orders, setOrders] = useState<MedicationRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [newOrderModalOpened, setNewOrderModalOpened] = useState(false);
  const [iframeModalOpened, setIframeModalOpened] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();
  // Which ScriptSure surface the modal is showing:
  // - 'widget': the single-order confirmation widget (`/widgets/prescription/...`),
  //   used for the initial prescribing flow right after creating an order.
  // - 'chart':  the full patient prescriptions/queue iframe (`/chart/.../prescriptions`),
  //   used when re-opening an existing order. The single-order widget is only
  //   designed for the initial flow and cannot approve/deny a queued order
  //   (issue #9300), so re-opens must land on the chart/queue surface instead.
  const [iframeMode, setIframeMode] = useState<'widget' | 'chart'>('widget');
  // refreshLaunchUrl reads this ref instead of closing over `iframeUrl`, so the
  // callback identity stays stable across URL changes. Without this the
  // PrescriptionIFrameModal effect that depends on `onRefreshLaunchUrl` would
  // re-run every time we set a new URL (including the one returned by the
  // refresh call itself, which would form a refresh loop).
  const iframeUrlRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    iframeUrlRef.current = iframeUrl;
  }, [iframeUrl]);
  /** MR id for iframe session + polling when URL/detail selection lags behind a new order. */
  const [iframePollMrId, setIframePollMrId] = useState<string | undefined>();
  const [fetchedOrder, setFetchedOrder] = useState<MedicationRequest | undefined>();

  const orderFromList = useMemo(
    () => (medicationRequestId ? orders.find((mr) => mr.id === medicationRequestId) : undefined),
    [medicationRequestId, orders]
  );

  const currentOrder = medicationRequestId
    ? (orderFromList ?? (fetchedOrder?.id === medicationRequestId ? fetchedOrder : undefined))
    : undefined;

  const patient = usePatient();
  const patientReference = useMemo(() => (patient ? getReferenceString(patient) : undefined), [patient]);
  const membership = medplum.getProjectMembership();
  const hasDoseSpot = hasDoseSpotIdentifier(membership);
  const hasScriptSure = hasScriptSureIdentifier(membership);

  const fetchOrders = useCallback(async (): Promise<void> => {
    if (!patientReference) {
      showErrorNotification('Patient not found');
      return;
    }
    try {
      const params = new URLSearchParams({
        subject: patientReference,
        status: statusParam,
        _count: String(PAGE_SIZE),
        _offset: String(offset),
        _sort: '-_lastUpdated',
        _total: 'accurate',
        _fields:
          '_lastUpdated,status,intent,medicationCodeableConcept,dosageInstruction,dispenseRequest,subject,requester,authoredOn,identifier,extension',
      });
      const bundle = await medplum.search('MedicationRequest', params, { cache: 'no-cache' });
      const entries: MedicationRequest[] = [];
      for (const entry of bundle.entry ?? []) {
        if (entry.resource?.resourceType === 'MedicationRequest') {
          entries.push(entry.resource);
        }
      }
      setOrders(entries);
      if (typeof bundle.total === 'number') {
        setTotal(bundle.total);
      } else {
        // Fallback for servers that omit `total`: assume "at least this many" so paging
        // controls remain visible if the current page is full.
        setTotal(offset + entries.length + (entries.length === PAGE_SIZE ? 1 : 0));
      }
    } catch (error) {
      showErrorNotification(error);
    }
  }, [medplum, patientReference, statusParam, offset]);

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

  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const getOrderUrl = useCallback(
    (order: MedicationRequest): string => {
      return `/Patient/${patientId}/MedicationRequest/${order.id}`;
    },
    [patientId]
  );

  useEffect(() => {
    let cancelled = false;
    if (medicationRequestId && !orderFromList) {
      medplum
        .readResource('MedicationRequest', medicationRequestId)
        .then((mr) => {
          if (!cancelled) {
            setFetchedOrder(mr);
          }
        })
        .catch(showErrorNotification);
    }
    return () => {
      cancelled = true;
    };
  }, [medicationRequestId, orderFromList, medplum]);

  useEffect(() => {
    if (!hasDoseSpot || !patient?.id) {
      return undefined;
    }
    const today = new Date().toISOString().split('T')[0];
    const notificationId = 'dosespot-sync';
    let cancelled = false;
    showNotification({
      id: notificationId,
      loading: true,
      title: 'Syncing with DoseSpot',
      message: '',
      autoClose: false,
      withCloseButton: false,
    });
    (async () => {
      try {
        await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, { patientId: patient.id });
        await Promise.all([
          medplum.executeBot(DOSESPOT_PRESCRIPTIONS_SYNC_BOT, {
            patientId: patient.id as string,
            start: today,
            end: today,
          }),
          medplum.executeBot(DOSESPOT_MEDICATION_HISTORY_BOT, {
            patientId: patient.id as string,
            start: today,
            end: today,
          }),
        ]);
        if (!cancelled) {
          updateNotification({
            id: notificationId,
            loading: false,
            color: 'green',
            icon: '✓',
            title: 'Successfully synced prescriptions and medications with DoseSpot',
            message: '',
            autoClose: 3000,
          });
          medplum.invalidateSearches('MedicationRequest');
          await fetchDataRef.current();
        }
      } catch (err) {
        if (!cancelled) {
          hideNotification(notificationId);
          showErrorNotification(err);
        }
      }
    })().catch(showErrorNotification);
    return () => {
      cancelled = true;
    };
  }, [hasDoseSpot, medplum, patient?.id]);

  const handleOrderMedicationComplete = useCallback(
    async (result: { launchUrl: string; medicationRequestId?: string }): Promise<void> => {
      setNewOrderModalOpened(false);
      setIframeMode('widget');
      setIframePollMrId(result.medicationRequestId);
      setIframeUrl(result.launchUrl);
      setIframeModalOpened(true);
      // Switch to the Draft tab (URL-driven) so the just-created draft MR is visible
      // in the list once the server-side search refreshes.
      setTab('draft');
      await fetchData();
      if (result.medicationRequestId && patientId) {
        navigate(`/Patient/${patientId}/MedicationRequest/${result.medicationRequestId}`)?.catch(console.error);
      }
    },
    [fetchData, navigate, patientId, setTab]
  );

  const handleOpenScriptSureFromDetails = useCallback(async (): Promise<void> => {
    if (!patientId || !currentOrder?.id) {
      return;
    }
    try {
      // Re-opening an existing order from the list opens the full patient
      // prescriptions/queue iframe rather than the single-order widget. The
      // widget is only designed for the initial prescribing flow and cannot
      // approve/deny an order that was added to the queue (issue #9300); the
      // chart surface handles every state (queued, sent, etc.).
      const res = await medplum.executeBot(SCRIPTSURE_IFRAME_BOT, { patientId });
      if (!res?.url) {
        throw new Error('ScriptSure did not return a prescriptions URL');
      }
      setIframeMode('chart');
      setIframePollMrId(currentOrder.id);
      setIframeUrl(res.url);
      setIframeModalOpened(true);
      await fetchData();
    } catch (e) {
      showErrorNotification(e);
    }
  }, [patientId, currentOrder, medplum, fetchData]);

  const refreshLaunchUrl = useCallback(async (): Promise<string | undefined> => {
    if (!patientId) {
      return iframeUrlRef.current;
    }
    // Refresh from whichever surface is currently shown so an expired session
    // token is replaced with a matching URL (single-order widget vs chart).
    if (iframeMode === 'chart') {
      const res = await medplum.executeBot(SCRIPTSURE_IFRAME_BOT, { patientId });
      return res?.url ?? iframeUrlRef.current;
    }
    const mrId = iframePollMrId ?? currentOrder?.id;
    if (!mrId) {
      return iframeUrlRef.current;
    }
    const res = await orderMedication({ patientId, medicationRequestId: mrId });
    return res.launchUrl;
  }, [patientId, currentOrder, iframePollMrId, iframeMode, medplum, orderMedication]);

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
                  <Tabs
                    value={activeTab}
                    onChange={(v) => setTab((v as MedTab) || DEFAULT_TAB)}
                    variant="unstyled"
                    className="pill-tabs"
                  >
                    <Tabs.List>
                      <Tabs.Tab value="active">Active</Tabs.Tab>
                      <Tabs.Tab value="draft">Draft</Tabs.Tab>
                      <Tabs.Tab value="completed">Completed</Tabs.Tab>
                    </Tabs.List>
                  </Tabs>
                </Group>
                <Group gap="xs">
                  {hasScriptSure && (
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
                  )}
                </Group>
              </Flex>
            </Paper>
            <Divider />
            <Paper style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ScrollArea style={{ flex: 1 }} p="0.5rem">
                {loading && <MedListSkeleton />}
                {!loading && orders.length === 0 && <EmptyMedsState activeTab={activeTab} />}
                {!loading &&
                  orders.length > 0 &&
                  orders.map((item, index) => (
                    <React.Fragment key={item.id}>
                      <MedListItem
                        item={item}
                        selectedItem={currentOrder}
                        activeTab={activeTab}
                        getItemUrl={getOrderUrl}
                        medicationOrderExtensions={SCRIPTSURE_MEDICATION_ORDER_EXTENSIONS}
                      />
                      {index < orders.length - 1 && (
                        <Box px="0.5rem">
                          <Divider />
                        </Box>
                      )}
                    </React.Fragment>
                  ))}
              </ScrollArea>
              {!loading && totalPages > 1 && (
                <Box p="xs">
                  <Pagination
                    size="sm"
                    value={currentPage}
                    onChange={setPage}
                    total={totalPages}
                    siblings={0}
                    boundaries={1}
                  />
                </Box>
              )}
            </Paper>
          </Flex>
        </Box>

        <Box h="100%" style={{ flex: 1 }} className={classes.borderRight}>
          {currentOrder ? (
            <MedicationRequestDetails
              key={currentOrder.id}
              medicationRequest={currentOrder}
              medicationOrderExtensions={SCRIPTSURE_MEDICATION_ORDER_EXTENSIONS}
              onOpenInScriptSure={() => handleOpenScriptSureFromDetails().catch(showErrorNotification)}
            />
          ) : (
            <MedSelectEmpty />
          )}
        </Box>
      </Flex>

      <Modal
        opened={newOrderModalOpened}
        onClose={() => setNewOrderModalOpened(false)}
        size="xl"
        centered
        title="Order medication"
      >
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
        title={iframeMode === 'chart' ? 'ScriptSure prescriptions' : 'Complete prescription'}
      />
    </Box>
  );
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
