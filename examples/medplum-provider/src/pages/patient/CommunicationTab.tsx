// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { formatSearchQuery, getReferenceString, Operator } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { ThreadInbox } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { usePatient } from '../../hooks/usePatient';
import { normalizeCommunicationSearch } from '../../utils/communication-search';

export function CommunicationTab(): JSX.Element {
  const { patientId, messageId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const patient = usePatient();

  const currentSearch = useMemo(() => (location.search ? location.search.substring(1) : ''), [location.search]);

  const params = useMemo(() => new URLSearchParams(currentSearch), [currentSearch]);

  const { normalizedSearch, parsedSearch } = useMemo(() => {
    const entries = Array.from(params.entries());
    const patientRef = patient ? getReferenceString(patient) : undefined;
    if (patientRef) {
      entries.push(['patient', patientRef]);
    }
    const searchWithPatient = new URLSearchParams(entries).toString();
    return normalizeCommunicationSearch({
      search: searchWithPatient,
    });
  }, [params, patient]);

  useEffect(() => {
    if (normalizedSearch !== currentSearch) {
      const prefix = normalizedSearch ? `?${normalizedSearch}` : '';
      navigate(`/Patient/${patientId}/Communication${prefix}`, { replace: true })?.catch(console.error);
    }
  }, [currentSearch, navigate, normalizedSearch, patientId]);

  const basePath = messageId
    ? `/Patient/${patientId}/Communication/${messageId}`
    : `/Patient/${patientId}/Communication`;

  const onChange = (search: SearchRequest): void => {
    // Keep the selected thread open when the list search changes (pagination, filters)
    navigate(`${basePath}${formatSearchQuery(search)}`)?.catch(console.error);
  };

  const getThreadUri = (topic: Communication): string => {
    return `/Patient/${patientId}/Communication/${topic.id}${formatSearchQuery(parsedSearch)}`;
  };

  const buildStatusSearch = (value: Communication['status']): SearchRequest => {
    const otherFilters = parsedSearch.filters?.filter((f) => f.code !== 'status') || [];
    const newFilters = [...otherFilters, { code: 'status', operator: Operator.EQUALS, value }];
    return {
      ...parsedSearch,
      filters: newFilters,
      offset: 0,
    };
  };

  const inProgressUri = `/Patient/${patientId}/Communication${formatSearchQuery(buildStatusSearch('in-progress'))}`;
  const completedUri = `/Patient/${patientId}/Communication${formatSearchQuery(buildStatusSearch('completed'))}`;

  const onNew = (message: Communication): void => {
    navigate(getThreadUri(message))?.catch(console.error);
  };

  const onSelectFirst = (thread: Communication): void => {
    navigate(getThreadUri(thread), { replace: true })?.catch(console.error);
  };

  return (
    <div style={{ height: '100%' }}>
      <ThreadInbox
        threadId={messageId}
        query={formatSearchQuery(parsedSearch).substring(1)}
        subject={patient}
        showPatientSummary={false}
        onNew={onNew}
        onSelectFirst={onSelectFirst}
        getThreadUri={getThreadUri}
        onChange={onChange}
        inProgressUri={inProgressUri}
        completedUri={completedUri}
      />
    </div>
  );
}
