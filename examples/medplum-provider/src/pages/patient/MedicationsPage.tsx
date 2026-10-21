// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Button, Divider, Flex, Group, Stack, Text, Tooltip } from '@mantine/core';
import { hideNotification, showNotification, updateNotification } from '@mantine/notifications';
import type { MedplumClient, SearchRequest, WithId } from '@medplum/core';
import { Operator } from '@medplum/core';
import {
  DOSESPOT_MEDICATION_HISTORY_BOT,
  DOSESPOT_PATIENT_SYNC_BOT,
  DOSESPOT_PRESCRIPTIONS_SYNC_BOT,
} from '@medplum/dosespot-react';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { Loading, Modal, ResourceBoard, useMedplum } from '@medplum/react';
import {
  SCRIPTSURE_IFRAME_BOT,
  SCRIPTSURE_MEDICATION_ORDER_EXTENSIONS,
  useScriptSureCart,
  useScriptSureOrderMedication,
} from '@medplum/scriptsure-react';
import { IconPlus, IconShoppingCart, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { MedicationRequestDetails } from '../../components/meds/MedicationRequestDetails';
import type { MedTab } from '../../components/meds/MedListItem';
import { MedListItem } from '../../components/meds/MedListItem';
import { MedSelectEmpty } from '../../components/meds/MedSelectEmpty';
import { PrescriptionIFrameModal } from '../../components/meds/PrescriptionIFrameModal';
import { hasDoseSpotIdentifier, hasScriptSureIdentifier } from '../../components/utils';
import { usePatient } from '../../hooks/usePatient';
import { useScriptSurePractice } from '../../scriptsure/ScriptSurePractice';
import { showErrorNotification } from '../../utils/notifications';
import { OrderMedicationPage } from '../meds/OrderMedicationPage';

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

/**
 * Compact projection for list rows. Never feed a projected row to the details
 * panel: `resolveSelected` always reads the full resource instead.
 */
const LIST_FIELDS = [
  '_lastUpdated',
  'status',
  'intent',
  'medicationCodeableConcept',
  'dosageInstruction',
  'dispenseRequest',
  'subject',
  'requester',
  'authoredOn',
  'identifier',
  'extension',
];

export function MedicationsPage(): JSX.Element {
  const { patientId, medicationRequestId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const medplum = useMedplum();
  const { orderMedication } = useScriptSureOrderMedication();
  const { addToCart, adding, checkout, removeFromCart, clearCart } = useScriptSureCart();
  const { selectedOrganization } = useScriptSurePractice();

  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status') ?? TAB_TO_STATUS_PARAM[DEFAULT_TAB];
  const activeTab: MedTab = STATUS_PARAM_TO_TAB[statusParam] ?? DEFAULT_TAB;
  const offset = Math.max(0, Number.parseInt(searchParams.get('_offset') ?? '0', 10) || 0);

  const search = useMemo<SearchRequest>(
    () => ({
      resourceType: 'MedicationRequest',
      filters: [
        { code: 'subject', operator: Operator.EQUALS, value: `Patient/${patientId}` },
        { code: 'status', operator: Operator.EQUALS, value: statusParam },
      ],
      sortRules: [{ code: '_lastUpdated', descending: true }],
      count: PAGE_SIZE,
      offset,
      total: 'accurate',
      fields: LIST_FIELDS,
    }),
    [patientId, statusParam, offset]
  );

  // Tabs keep the current path (and so the selected order) and reset paging to page 1.
  const tabUri = useCallback(
    (tab: MedTab): string => `${location.pathname}?status=${TAB_TO_STATUS_PARAM[tab]}`,
    [location.pathname]
  );

  const handleSearchChange = useCallback(
    (next: SearchRequest) => {
      const nextOffset = next.offset ?? 0;
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

  const [refreshKey, setRefreshKey] = useState(0);
  const refreshList = useCallback((): void => setRefreshKey((k) => k + 1), []);
  const [total, setTotal] = useState(0);
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
  /**
   * The MR the iframe modal was opened for: it alone drives the session refresh and
   * sync polling. The URL selection is never used as a fallback, since the Draft tab
   * auto-selects a row and an order-set launch has no MR of its own.
   */
  const [iframePollMrId, setIframePollMrId] = useState<string | undefined>();
  /** Draft MR ids the MedCart checkout modal polls for sync after a cart checkout. */
  const [cartWatchIds, setCartWatchIds] = useState<string[]>([]);
  /** Count of draft (cart) MedicationRequests for the patient, shown in the order modal. */
  const [cartCount, setCartCount] = useState(0);
  const [checkingOut, setCheckingOut] = useState(false);
  const [clearingCart, setClearingCart] = useState(false);
  /** MR id whose "remove from cart" request is in flight (drives the row spinner). */
  const [removingId, setRemovingId] = useState<string | undefined>();

  const patient = usePatient();
  const patientReference = `Patient/${patientId}`;
  const membership = medplum.getProjectMembership();
  const hasDoseSpot = hasDoseSpotIdentifier(membership);
  const hasScriptSure = hasScriptSureIdentifier(membership);

  /**
   * The list rows are a `_fields` projection, so the selection is always read in full
   * and re-read whenever the list reloads, keeping the details current. A failed read
   * (e.g. a cart draft the bot hard-deleted while it was selected) resolves to nothing
   * rather than toasting, since the stale id is dropped from the URL right after.
   */
  const resolveSelected = useCallback(
    async (
      id: string,
      _items: WithId<MedicationRequest>[],
      client: MedplumClient
    ): Promise<WithId<MedicationRequest> | undefined> => {
      try {
        return await client.readResource('MedicationRequest', id, { cache: 'reload' });
      } catch {
        return undefined;
      }
    },
    []
  );

  /** Drops the selected order from the URL (keeping the tab/page query) so the next item auto-selects. */
  const clearSelection = useCallback((): void => {
    navigate(`/Patient/${patientId}/MedicationRequest${location.search}`, { replace: true })?.catch(console.error);
  }, [navigate, patientId, location.search]);

  const getOrderUrl = useCallback(
    (order: MedicationRequest): string => {
      const query = searchParams.toString();
      return `/Patient/${patientId}/MedicationRequest/${order.id}${query ? `?${query}` : ''}`;
    },
    [patientId, searchParams]
  );

  useEffect(() => {
    if (!hasDoseSpot || !patient?.id) {
      return undefined;
    }
    const today = new Date().toISOString().split('T')[0];
    const notificationId = 'dosespot-sync';
    let cancelled = false;
    let syncing = true;
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
          refreshList();
        }
      } catch (err) {
        if (!cancelled) {
          hideNotification(notificationId);
          showErrorNotification(err);
        }
      } finally {
        syncing = false;
      }
    })().catch(showErrorNotification);
    return () => {
      cancelled = true;
      // Dismiss the persistent loading toast if sync is still in flight when we
      // unmount; otherwise the global notification lingers forever after navigating away.
      if (syncing) {
        hideNotification(notificationId);
      }
    };
  }, [hasDoseSpot, medplum, patient?.id, refreshList]);

  const handleOrderMedicationComplete = useCallback(
    (result: { launchUrl: string; medicationRequestId?: string }): void => {
      setNewOrderModalOpened(false);
      setIframeMode('widget');
      setIframePollMrId(result.medicationRequestId);
      setIframeUrl(result.launchUrl);
      setIframeModalOpened(true);
      // Land on the Draft tab with the just-created draft selected; the URL change reloads the list.
      refreshList();
      const path = result.medicationRequestId
        ? `/Patient/${patientId}/MedicationRequest/${result.medicationRequestId}`
        : location.pathname;
      navigate(`${path}?status=${TAB_TO_STATUS_PARAM.draft}`)?.catch(console.error);
    },
    [navigate, patientId, location.pathname, refreshList]
  );

  const handleOpenScriptSureFromDetails = useCallback(
    async (order: WithId<MedicationRequest>): Promise<void> => {
      if (!patientId) {
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
        setIframePollMrId(order.id);
        setIframeUrl(res.url);
        setIframeModalOpened(true);
        refreshList();
      } catch (e) {
        showErrorNotification(e);
      }
    },
    [patientId, medplum, refreshList, selectedOrganization]
  );

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
    if (!iframePollMrId) {
      return iframeUrlRef.current;
    }
    const res = await orderMedication({
      patientId,
      medicationRequestId: iframePollMrId,
      organization: selectedOrganization,
    });
    return res.launchUrl;
  }, [patientId, iframePollMrId, iframeMode, medplum, orderMedication, selectedOrganization]);

  const closeIframeModal = useCallback((): void => {
    setIframeModalOpened(false);
    setIframeUrl(undefined);
    setIframePollMrId(undefined);
    setCartWatchIds([]);
    refreshList();
  }, [refreshList]);

  // The cart is every draft MedicationRequest for this patient (all pages). The
  // Draft tab list is paginated, but checkout must submit the whole cart so
  // counts stay consistent with Clear cart and the order-modal indicator.
  const fetchAllDraftIds = useCallback(async (): Promise<string[]> => {
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
      navigate(tabUri('draft'), { replace: true })?.catch(console.error);
    }
    refreshCartCount().catch(showErrorNotification);
    refreshList();
  }, [medplum, activeTab, navigate, tabUri, refreshList, refreshCartCount]);

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
      refreshList();
    } catch (e) {
      showErrorNotification(e);
    } finally {
      setCheckingOut(false);
    }
  }, [patient, total, fetchAllDraftIds, checkout, refreshList, selectedOrganization]);

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
        if (item?.status !== 'failed' && mrId === medicationRequestId) {
          clearSelection();
        }
        refreshList();
        await refreshCartCount();
      } catch (e) {
        showErrorNotification(e);
      } finally {
        setRemovingId(undefined);
      }
    },
    [patient, removeFromCart, medplum, refreshList, refreshCartCount, medicationRequestId, clearSelection]
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
      const removedIds = res.items.filter((i) => i.status !== 'failed').map((i) => i.medicationRequestId);
      if (medicationRequestId && removedIds.includes(medicationRequestId)) {
        clearSelection();
      }
      refreshList();
      await refreshCartCount();
    } catch (e) {
      showErrorNotification(e);
    } finally {
      setClearingCart(false);
    }
  }, [patient, clearCart, medplum, refreshList, refreshCartCount, medicationRequestId, clearSelection]);

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
  const canRefreshLaunchUrl = !isCartCheckoutMode && Boolean(iframePollMrId);
  const modalRefreshLaunchUrl = canRefreshLaunchUrl ? refreshLaunchUrl : undefined;
  let medicationRequestIdsToWatch: string[] | undefined;
  if (isCartCheckoutMode) {
    medicationRequestIdsToWatch = cartWatchIds;
  } else {
    medicationRequestIdsToWatch = iframePollMrId ? [iframePollMrId] : undefined;
  }

  const showCart = hasScriptSure && activeTab === 'draft';

  const tabs = [
    { value: 'active', label: 'Active', uri: tabUri('active') },
    { value: 'draft', label: 'Draft', uri: tabUri('draft') },
    { value: 'completed', label: 'Completed', uri: tabUri('completed') },
  ];

  const headerActions = hasScriptSure && (
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
  );

  const cartFooter = showCart && total > 0 && (
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
  );

  return (
    <>
      <ResourceBoard<MedicationRequest>
        search={search}
        selectedId={medicationRequestId}
        reloadKey={refreshKey}
        resolveSelected={resolveSelected}
        tabs={tabs}
        activeTab={activeTab}
        headerActions={headerActions}
        renderItem={(item, { selected }) => (
          <MedListItem
            item={item}
            selectedItem={selected ? item : undefined}
            activeTab={activeTab}
            getItemUrl={getOrderUrl}
            medicationOrderExtensions={SCRIPTSURE_MEDICATION_ORDER_EXTENSIONS}
            actions={
              showCart && (
                <Tooltip label="Remove from cart" position="left" openDelay={500}>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label="Remove medication from cart"
                    loading={removingId === item.id}
                    onClick={() => handleRemoveFromCart(item.id).catch(showErrorNotification)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              )
            }
          />
        )}
        emptyList={<EmptyMedsState activeTab={activeTab} />}
        listFooter={cartFooter}
        renderDetail={(order) => (
          <Box key={order.id} flex={1} miw={0} h="100%" style={{ overflow: 'auto' }}>
            <MedicationRequestDetails
              medicationRequest={order}
              medicationOrderExtensions={SCRIPTSURE_MEDICATION_ORDER_EXTENSIONS}
              onOpenInScriptSure={() => handleOpenScriptSureFromDetails(order).catch(showErrorNotification)}
            />
          </Box>
        )}
        emptyDetail={<MedSelectEmpty />}
        onChange={handleSearchChange}
        onSelectFirst={(order) => navigate(getOrderUrl(order), { replace: true })?.catch(console.error)}
        onLoad={(_items, loadedTotal) => setTotal(loadedTotal ?? 0)}
        onError={showErrorNotification}
      />

      <Modal
        opened={newOrderModalOpened}
        onClose={() => setNewOrderModalOpened(false)}
        size="xl"
        title="Order medication"
      >
        <OrderMedicationPage
          patient={patient}
          onOrderComplete={handleOrderMedicationComplete}
          onAddedToCart={handleAddedToCart}
          persistCartDraft={addToCart}
          cartAdding={adding}
          cartCount={cartCount}
        />
      </Modal>

      <PrescriptionIFrameModal
        opened={iframeModalOpened}
        onClose={closeIframeModal}
        launchUrl={iframeUrl}
        onRefreshLaunchUrl={modalRefreshLaunchUrl}
        medicationRequestIdsToWatch={medicationRequestIdsToWatch}
        onFhirSynced={closeIframeModal}
        title={modalTitle}
      />
    </>
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
