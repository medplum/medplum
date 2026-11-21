// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { formatSearchQuery, parseSearchRequest } from '@medplum/core';
import type { LabItem, LabTab } from '@medplum/react';
import { LabOrdersPanel } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { OrderLabsModal } from '../../components/labs/OrderLabsModal';
import { usePatient } from '../../hooks/usePatient';
import { addDefaultLabSearchValues, getLabResourceType, LAB_REVOKED_ORDER_STATUS } from '../../utils/labSearch';

export interface LabsPageProps {
  tab: LabTab;
}

export function LabsPage(props: LabsPageProps): JSX.Element {
  const { tab } = props;
  const { patientId, serviceRequestId, diagnosticReportId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const patient = usePatient();

  // The "Revoked" tab shares the ServiceRequest route with the "Open" tab, so
  // it is identified by the URL's status filter rather than by the route.
  const activeTab: LabTab = useMemo(() => {
    if (tab !== 'completed') {
      const status = parseSearchRequest(`ServiceRequest${location.search}`).filters?.find(
        (filter) => filter.code === 'status'
      )?.value;
      if (status === LAB_REVOKED_ORDER_STATUS) {
        return 'revoked';
      }
    }
    return tab;
  }, [tab, location.search]);

  const resourceType = getLabResourceType(activeTab);

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

  const tabUri = (t: LabTab): string => {
    const tabResourceType = getLabResourceType(t);
    const query = formatSearchQuery(addDefaultLabSearchValues(parseSearchRequest(tabResourceType), t));
    return `/Patient/${patientId}/${tabResourceType}${query}`;
  };
  const openUri = tabUri('open');

  const getItemUri = (item: LabItem): string =>
    `/Patient/${patientId}/${item.resourceType}/${item.id}${location.search}`;

  // Paging navigates to the list, dropping any selected item.
  const onChange = (nextSearch: SearchRequest): void => {
    navigate(`/Patient/${patientId}/${resourceType}${formatSearchQuery(nextSearch)}`)?.catch(console.error);
  };

  const onNew = useCallback((): void => {
    navigate(openUri)?.catch(console.error);
  }, [navigate, openUri]);

  return (
    <LabOrdersPanel
      patient={patient}
      search={search}
      activeTab={activeTab}
      selectedId={activeTab === 'completed' ? diagnosticReportId : serviceRequestId}
      getItemUri={getItemUri}
      onChange={onChange}
      completedUri={tabUri('completed')}
      openUri={openUri}
      revokedUri={tabUri('revoked')}
      onNew={onNew}
      renderOrderModal={({ opened, draftOrder, onClose, onSaved }) => (
        <OrderLabsModal
          opened={opened}
          onClose={onClose}
          draftOrder={draftOrder}
          onSubmitLabOrder={onSaved}
          onSaveDraft={onSaved}
        />
      )}
    />
  );
}
