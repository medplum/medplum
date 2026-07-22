// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Box,
  Button,
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
import type { MedicationDispense, MedicationRequest, MedicationStatement, Resource } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import {
    SCRIPTSURE_IFRAME_BOT,
    SCRIPTSURE_MEDICATION_ORDER_EXTENSIONS,
    useScriptSureCart,
    useScriptSureOrderMedication,
} from '@medplum/scriptsure-react';
import { IconPlus, IconShoppingCart, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { MedicationRequestDetails } from '../../components/meds/MedicationRequestDetails';
import type { MedicationListResource, MedTab } from '../../components/meds/MedListItem';
import { MedListItem } from '../../components/meds/MedListItem';
import { MedSelectEmpty } from '../../components/meds/MedSelectEmpty';
import { PrescriptionIFrameModal } from '../../components/meds/PrescriptionIFrameModal';
import { hasDoseSpotIdentifier, hasScriptSureIdentifier } from '../../components/utils';
import { usePatient } from '../../hooks/usePatient';
import { useScriptSurePractice } from '../../scriptsure/ScriptSurePractice';
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

const TAB_TO_MEDICATION_STATEMENT_STATUS_PARAM: Partial<Record<MedTab, string>> = {
  active: 'active,intended,on-hold,unknown',
  completed: 'completed,stopped,not-taken,entered-in-error',
};

const STATUS_PARAM_TO_TAB: Record<string, MedTab> = {
  'active,on-hold,unknown': 'active',
  draft: 'draft',
  'completed,stopped,cancelled,entered-in-error': 'completed',
};

const DEFAULT_TAB: MedTab = 'active';

export function MedicationsPage(): JSX.Element {
  const { patientId, medicationRequestId, medicationStatementId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const { orderMedication } = useScriptSureOrderMedication();
  const { addToCart, adding, checkout, removeFromCart, clearCart } = useScriptSureCart();
  const { selectedOrganization } = useScriptSurePractice();

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

  const [orders, setOrders] = useState<MedicationListResource[]>([]);
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
  // - 'cart-checkout': the batch MedCart widget (`/widgets/medcart/{patientId}`)
  //   from a cart checkout, where every med added to the cart is reviewed and
  //   signed together.
  const [iframeMode, setIframeMode] = useState<'widget' | 'chart' | 'cart-checkout'>('widget');
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
  const [fetchedOrder, setFetchedOrder] = useState<MedicationListResource | undefined>();
  const [selectedMedicationDispenses, setSelectedMedicationDispenses] = useState<MedicationDispense[]>([]);
  /** Draft MR ids the MedCart checkout modal polls for sync after a cart checkout. */
  const [cartWatchIds, setCartWatchIds] = useState<string[]>([]);
  /** Count of draft (cart) MedicationRequests for the patient, shown in the order modal. */
  const [cartCount, setCartCount] = useState(0);
  const [checkingOut, setCheckingOut] = useState(false);
  const [clearingCart, setClearingCart] = useState(false);
  /** MR id whose "remove from cart" request is in flight (drives the row spinner). */
  const [removingId, setRemovingId] = useState<string | undefined>();

  const selectedResourceType = medicationStatementId ? 'MedicationStatement' : medicationRequestId ? 'MedicationRequest' : undefined;
  const selectedMedicationId = medicationStatementId ?? medicationRequestId;

  const orderFromList = useMemo(
    () =>
      selectedMedicationId && selectedResourceType
        ? orders.find((mr) => mr.resourceType === selectedResourceType && mr.id === selectedMedicationId)
        : undefined,
    [selectedMedicationId, selectedResourceType, orders]
  );

  const currentOrder = selectedMedicationId
    ? (orderFromList ??
      (fetchedOrder?.resourceType === selectedResourceType && fetchedOrder?.id === selectedMedicationId
        ? fetchedOrder
        : undefined))
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
      const count = String(offset + PAGE_SIZE);
      const medicationRequestParams = new URLSearchParams({
        subject: patientReference,
        status: statusParam,
        _count: count,
        _offset: '0',
        _sort: '-_lastUpdated',
        _total: 'accurate',
        _fields:
          '_lastUpdated,status,intent,medicationCodeableConcept,dosageInstruction,dispenseRequest,subject,requester,authoredOn,identifier,extension',
      });
      const medicationStatementStatus = TAB_TO_MEDICATION_STATEMENT_STATUS_PARAM[activeTab];
      const medicationStatementSearch = medicationStatementStatus
        ? medplum.search(
            'MedicationStatement',
            new URLSearchParams({
              subject: patientReference,
              status: medicationStatementStatus,
              _count: count,
              _offset: '0',
              _sort: '-_lastUpdated',
              _total: 'accurate',
              _fields:
                '_lastUpdated,status,medicationCodeableConcept,dosage,subject,informationSource,effectiveDateTime,dateAsserted,reasonCode,note,identifier',
            }),
            { cache: 'no-cache' }
          )
        : undefined;
      const [medicationRequestBundle, medicationStatementBundle] = await Promise.all([
        medplum.search('MedicationRequest', medicationRequestParams, { cache: 'no-cache' }),
        medicationStatementSearch,
      ]);
      const entries: MedicationListResource[] = [];
      for (const entry of medicationRequestBundle.entry ?? []) {
        if (entry.resource?.resourceType === 'MedicationRequest') {
          entries.push(entry.resource);
        }
      }
      for (const entry of medicationStatementBundle?.entry ?? []) {
        if (entry.resource?.resourceType === 'MedicationStatement') {
          entries.push(entry.resource);
        }
      }
      entries.sort(compareMedicationResourcesByLastUpdatedDescending);
      setOrders(entries.slice(offset, offset + PAGE_SIZE));
      if (
        typeof medicationRequestBundle.total === 'number' ||
        typeof medicationStatementBundle?.total === 'number'
      ) {
        setTotal((medicationRequestBundle.total ?? 0) + (medicationStatementBundle?.total ?? 0));
      } else {
        // Fallback for servers that omit `total`: assume "at least this many" so paging
        // controls remain visible if the current page is full.
        setTotal(offset + entries.length + (entries.length === PAGE_SIZE ? 1 : 0));
      }
    } catch (error) {
      showErrorNotification(error);
    }
  }, [medplum, patientReference, statusParam, offset, activeTab]);

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
    (order: MedicationListResource): string => {
      return `/Patient/${patientId}/${order.resourceType}/${order.id}`;
    },
    [patientId]
  );

  useEffect(() => {
    let cancelled = false;
    if (selectedMedicationId && selectedResourceType && !orderFromList) {
      medplum
        .readResource(selectedResourceType, selectedMedicationId)
        .then((mr: MedicationRequest | MedicationStatement) => {
          if (!cancelled) {
            setFetchedOrder(mr);
          }
        })
        .catch(showErrorNotification);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedMedicationId, selectedResourceType, orderFromList, medplum]);

  useEffect(() => {
    let cancelled = false;
    if (currentOrder?.resourceType !== 'MedicationRequest' || !currentOrder.id) {
      setSelectedMedicationDispenses([]);
      return () => {
        cancelled = true;
      };
    }
    medplum
      .search(
        'MedicationDispense',
        {
          prescription: `MedicationRequest/${currentOrder.id}`,
          _count: '20',
          _sort: '-_lastUpdated',
          _fields: 'status,medicationCodeableConcept,quantity,daysSupply,whenPrepared,whenHandedOver,performer,authorizingPrescription',
        },
        { cache: 'no-cache' }
      )
      .then((bundle) => {
        if (cancelled) {
          return;
        }
        const dispenses = (bundle.entry ?? [])
          .map((entry) => entry.resource)
          .filter((resource): resource is MedicationDispense => resource?.resourceType === 'MedicationDispense')
          .sort(compareMedicationDispensesDescending);
        setSelectedMedicationDispenses(dispenses);
      })
      .catch(showErrorNotification);
    return () => {
      cancelled = true;
    };
  }, [currentOrder, medplum]);

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
    if (!patientId || !currentOrder?.id || currentOrder.resourceType !== 'MedicationRequest') {
      return;
    }
    try {
      // Re-opening an existing order from the list opens the full patient
      // prescriptions/queue iframe rather than the single-order widget. The
      // widget is only designed for the initial prescribing flow and cannot
      // approve/deny an order that was added to the queue (issue #9300); the
      // chart surface handles every state (queued, sent, etc.).
      const res = await medplum.executeBot(SCRIPTSURE_IFRAME_BOT, {
        patientId,
        organization: selectedOrganization,
      });
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
  }, [patientId, currentOrder, medplum, fetchData, selectedOrganization]);

  const refreshLaunchUrl = useCallback(async (): Promise<string | undefined> => {
    if (!patientId) {
      return iframeUrlRef.current;
    }
    // Refresh from whichever surface is currently shown so an expired session
    // token is replaced with a matching URL (single-order widget vs chart).
    if (iframeMode === 'chart') {
      const res = await medplum.executeBot(SCRIPTSURE_IFRAME_BOT, {
        patientId,
        organization: selectedOrganization,
      });
      return res?.url ?? iframeUrlRef.current;
    }
    const mrId = iframePollMrId ?? (currentOrder?.resourceType === 'MedicationRequest' ? currentOrder.id : undefined);
    if (!mrId) {
      return iframeUrlRef.current;
    }
    const res = await orderMedication({ patientId, medicationRequestId: mrId, organization: selectedOrganization });
    return res.launchUrl;
  }, [patientId, currentOrder, iframePollMrId, iframeMode, medplum, orderMedication, selectedOrganization]);

  const handleIframeFhirSynced = useCallback((): void => {
    setIframeModalOpened(false);
    setIframeUrl(undefined);
    setIframePollMrId(undefined);
    setCartWatchIds([]);
    fetchData().catch(showErrorNotification);
  }, [fetchData]);

  // The cart is every draft MedicationRequest for this patient (all pages). The
  // Draft tab list is paginated, but checkout must submit the whole cart so
  // counts stay consistent with Clear cart and the order-modal indicator.
  const fetchAllDraftIds = useCallback(async (): Promise<string[]> => {
    if (!patientReference) {
      return [];
    }
    const ids: string[] = [];
    const pageSize = 100;
    let pageOffset = 0;
    let expectedTotal = Number.POSITIVE_INFINITY;

    while (ids.length < expectedTotal) {
      const bundle = await medplum.search(
        'MedicationRequest',
        {
          subject: patientReference,
          status: 'draft',
          _count: String(pageSize),
          _offset: String(pageOffset),
          _sort: '-_lastUpdated',
          _total: 'accurate',
          _fields: 'id',
        },
        { cache: 'no-cache' }
      );
      expectedTotal = bundle.total ?? ids.length;
      const pageEntries = bundle.entry ?? [];
      for (const entry of pageEntries) {
        const id = entry.resource?.id;
        if (typeof id === 'string' && id.length > 0) {
          ids.push(id);
        }
      }
      if (pageEntries.length < pageSize) {
        break;
      }
      pageOffset += pageSize;
    }

    return ids;
  }, [medplum, patientReference]);

  // Counts the patient's draft (cart) MRs independent of the active tab, so the
  // order modal can show an accurate "N in cart" even when opened from Active.
  const refreshCartCount = useCallback(async (): Promise<void> => {
    if (!patientReference) {
      return;
    }
    try {
      const bundle = await medplum.search(
        'MedicationRequest',
        { subject: patientReference, status: 'draft', _summary: 'count' },
        { cache: 'no-cache' }
      );
      setCartCount(bundle.total ?? 0);
    } catch {
      // Non-critical: the indicator is advisory only.
    }
  }, [medplum, patientReference]);

  const handleAddedToCart = useCallback((): void => {
    showNotification({
      color: 'green',
      icon: '✓',
      title: 'Added to cart',
      message: 'Draft saved. Add more, then check out from the Draft tab.',
      autoClose: 2500,
    });
    medplum.invalidateSearches('MedicationRequest');
    if (activeTab !== 'draft') {
      setTab('draft');
    }
    refreshCartCount().catch(showErrorNotification);
    fetchData().catch(showErrorNotification);
  }, [medplum, activeTab, setTab, fetchData, refreshCartCount]);

  const handleCheckout = useCallback(async (): Promise<void> => {
    const checkoutPatientId = patient?.id;
    if (!checkoutPatientId || total === 0) {
      return;
    }
    setCheckingOut(true);
    try {
      const medicationRequestIds = await fetchAllDraftIds();
      if (medicationRequestIds.length === 0) {
        return;
      }
      const res = await checkout({
        patientId: checkoutPatientId,
        medicationRequestIds,
        organization: selectedOrganization,
      });
      const failed = res.items.filter((i) => i.status === 'failed');
      const queuedIds = res.items.filter((i) => i.status === 'queued').map((i) => i.medicationRequestId);
      if (failed.length > 0) {
        showNotification({
          color: 'yellow',
          title: `${failed.length} medication${failed.length === 1 ? '' : 's'} could not be queued`,
          message: failed.map((f) => f.error ?? f.medicationRequestId).join('; '),
          autoClose: false,
        });
      }
      if (queuedIds.length === 0) {
        // Every line failed — don't open the widget or poll drafts that will never reconcile.
        return;
      }
      setCartWatchIds(queuedIds);
      setIframeMode('cart-checkout');
      setIframePollMrId(undefined);
      setIframeUrl(res.approvalUrl);
      setIframeModalOpened(true);
      await fetchData();
    } catch (e) {
      showErrorNotification(e);
    } finally {
      setCheckingOut(false);
    }
  }, [patient, total, fetchAllDraftIds, checkout, fetchData, selectedOrganization]);

  const handleRemoveFromCart = useCallback(
    async (mrId: string): Promise<void> => {
      const cartPatientId = patient?.id;
      if (!cartPatientId) {
        return;
      }
      setRemovingId(mrId);
      try {
        const res = await removeFromCart({ patientId: cartPatientId, medicationRequestId: mrId });
        const item = res.items[0];
        if (item?.status === 'failed') {
          showNotification({
            color: 'red',
            title: 'Could not remove from cart',
            message: item.error ?? mrId,
            autoClose: false,
          });
        } else {
          showNotification({
            color: 'green',
            icon: '✓',
            title: 'Removed from cart',
            message: 'The medication was removed from the cart.',
            autoClose: 2500,
          });
        }
        medplum.invalidateSearches('MedicationRequest');
        await Promise.all([fetchData(), refreshCartCount()]);
      } catch (e) {
        showErrorNotification(e);
      } finally {
        setRemovingId(undefined);
      }
    },
    [patient, removeFromCart, medplum, fetchData, refreshCartCount]
  );

  const handleClearCart = useCallback(async (): Promise<void> => {
    const cartPatientId = patient?.id;
    if (!cartPatientId) {
      return;
    }
    setClearingCart(true);
    try {
      const res = await clearCart({ patientId: cartPatientId });
      const failed = res.items.filter((i) => i.status === 'failed');
      if (failed.length > 0) {
        showNotification({
          color: 'yellow',
          title: `${failed.length} item${failed.length === 1 ? '' : 's'} could not be removed`,
          message: failed.map((f) => f.error ?? f.medicationRequestId).join('; '),
          autoClose: false,
        });
      } else {
        showNotification({
          color: 'green',
          icon: '✓',
          title: 'Cart cleared',
          message: `Removed ${res.removedCount} item${res.removedCount === 1 ? '' : 's'} from the cart.`,
          autoClose: 2500,
        });
      }
      medplum.invalidateSearches('MedicationRequest');
      await Promise.all([fetchData(), refreshCartCount()]);
    } catch (e) {
      showErrorNotification(e);
    } finally {
      setClearingCart(false);
    }
  }, [patient, clearCart, medplum, fetchData, refreshCartCount]);

  if (!patient || !patientId) {
    return <Loading />;
  }

  const isCartCheckoutMode = iframeMode === 'cart-checkout';
  let modalTitle = 'Complete prescription';
  if (isCartCheckoutMode) {
    modalTitle = 'Approve queued prescriptions';
  } else if (iframeMode === 'chart') {
    modalTitle = 'ScriptSure prescriptions';
  }
  // The MedCart widget URL carries a fresh session token from `$checkout-medications`
  // and re-running checkout would re-submit the cart, so that mode never refreshes.
  // Other modes refresh the single-order/chart session token in place.
  const canRefreshLaunchUrl =
    !isCartCheckoutMode &&
    Boolean(iframePollMrId || (currentOrder?.resourceType === 'MedicationRequest' && currentOrder.id));
  const modalRefreshLaunchUrl = canRefreshLaunchUrl ? refreshLaunchUrl : undefined;
  let medicationRequestIdsToWatch: string[] | undefined;
  if (isCartCheckoutMode) {
    medicationRequestIdsToWatch = cartWatchIds;
  } else {
    const singleWatchId =
      iframePollMrId ?? (currentOrder?.resourceType === 'MedicationRequest' ? currentOrder.id : undefined);
    medicationRequestIdsToWatch = singleWatchId ? [singleWatchId] : undefined;
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
                        onClick={() => {
                          refreshCartCount().catch(showErrorNotification);
                          setNewOrderModalOpened(true);
                        }}
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
                  orders.map((item, index) => {
                    const showCartRow =
                      hasScriptSure &&
                      activeTab === 'draft' &&
                      item.resourceType === 'MedicationRequest' &&
                      typeof item.id === 'string';
                    const row = (
                      <MedListItem
                        item={item}
                        selectedItem={currentOrder}
                        activeTab={activeTab}
                        getItemUrl={getOrderUrl}
                        medicationOrderExtensions={SCRIPTSURE_MEDICATION_ORDER_EXTENSIONS}
                      />
                    );
                    return (
                      <React.Fragment key={item.id}>
                        {showCartRow ? (
                          <Group gap="xs" wrap="nowrap" align="center" pl="0.5rem">
                            <Box className={classes.cartRowContent}>{row}</Box>
                            <Tooltip label="Remove from cart" position="left" openDelay={500}>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                size="sm"
                                aria-label="Remove medication from cart"
                                loading={removingId === item.id}
                                onClick={() => handleRemoveFromCart(item.id as string).catch(showErrorNotification)}
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        ) : (
                          row
                        )}
                        {index < orders.length - 1 && (
                          <Box px="0.5rem">
                            <Divider />
                          </Box>
                        )}
                      </React.Fragment>
                    );
                  })}
              </ScrollArea>
              {!loading && hasScriptSure && activeTab === 'draft' && total > 0 && (
                <>
                  <Divider />
                  <Box p="xs">
                    <Group justify="flex-end" gap="xs" wrap="nowrap">
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        loading={clearingCart}
                        onClick={() => handleClearCart().catch(showErrorNotification)}
                      >
                        Clear cart ({total})
                      </Button>
                      <Button
                        size="xs"
                        leftSection={<IconShoppingCart size={14} />}
                        loading={checkingOut}
                        disabled={total === 0 || adding}
                        onClick={() => handleCheckout().catch(showErrorNotification)}
                      >
                        Checkout ({total})
                      </Button>
                    </Group>
                  </Box>
                </>
              )}
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
              medicationDispenses={selectedMedicationDispenses}
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
          onAddedToCart={handleAddedToCart}
          persistCartDraft={addToCart}
          cartAdding={adding}
          cartCount={cartCount}
        />
      </Modal>

      <PrescriptionIFrameModal
        opened={iframeModalOpened}
        onClose={() => {
          setIframeModalOpened(false);
          setIframeUrl(undefined);
          setIframePollMrId(undefined);
          setCartWatchIds([]);
          fetchData().catch(showErrorNotification);
        }}
        launchUrl={iframeUrl}
        onRefreshLaunchUrl={modalRefreshLaunchUrl}
        medicationRequestIdsToWatch={medicationRequestIdsToWatch}
        onFhirSynced={handleIframeFhirSynced}
        title={modalTitle}
      />
    </Box>
  );
}

function compareMedicationResourcesByLastUpdatedDescending(a: Resource, b: Resource): number {
  return (b.meta?.lastUpdated ?? '').localeCompare(a.meta?.lastUpdated ?? '');
}

function compareMedicationDispensesDescending(a: MedicationDispense, b: MedicationDispense): number {
  const aDate = a.whenHandedOver ?? a.whenPrepared ?? a.meta?.lastUpdated ?? '';
  const bDate = b.whenHandedOver ?? b.whenPrepared ?? b.meta?.lastUpdated ?? '';
  return bDate.localeCompare(aDate);
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
