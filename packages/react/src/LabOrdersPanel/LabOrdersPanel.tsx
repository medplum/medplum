// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { Filter, SearchRequest, WithId } from '@medplum/core';
import { formatSearchQuery, getReferenceString, normalizeErrorString, Operator } from '@medplum/core';
import type { Patient, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { ListWithDetailPaneTabLinkRenderer } from '../ListWithDetailPane/ListWithDetailPane';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { LabDetailPane } from './LabDetailPane';
import { LabListItem } from './LabListItem';
import type { LabItem, LabTab } from './LabOrdersPanelView';
import { LabOrdersPanelView } from './LabOrdersPanelView';
import { LabResultListItem } from './LabResultListItem';

export type { LabItem, LabTab } from './LabOrdersPanelView';

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

  const handleOrderSaved = useCallback((): void => {
    setOrderModal(undefined);
    fetchData()
      .then(() => onNew?.())
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [fetchData, onNew]);

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
        renderItem={(item, isSelected) =>
          item.resourceType === 'DiagnosticReport' ? (
            <LabResultListItem report={item} selected={isSelected} to={getItemUri(item)} />
          ) : (
            <LabListItem
              item={item}
              selectedItem={isSelected ? item : undefined}
              activeTab="open"
              onItemSelect={() => getItemUri(item)}
            />
          )
        }
        renderDetail={(item) => (
          <LabDetailPane
            item={item}
            onOrderChange={() =>
              fetchData().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }))
            }
            onResumeOrder={renderOrderModal ? setOrderModal : undefined}
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
