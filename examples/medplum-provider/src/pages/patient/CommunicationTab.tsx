// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { ThreadInbox } from '@medplum/react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useEffect, useMemo } from 'react';
import { formatSearchQuery, Operator } from '@medplum/core';
import type { SearchRequest } from '@medplum/core';
import { normalizeCommunicationSearch } from '../../utils/communication-search';

export function CommunicationTab(): JSX.Element {
  const { patientId, messageId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const patientRef = `Patient/${patientId}`;

  const currentSearch = useMemo(() => (location.search ? location.search.substring(1) : ''), [location.search]);

  const params = useMemo(() => new URLSearchParams(currentSearch), [currentSearch]);

  const hasPatient = params.has('patient');

  const { normalizedSearch, parsedSearch } = useMemo(() => {
    const entries = Array.from(params.entries());
    if (!hasPatient) {
      entries.push(['patient', patientRef]);
    }
    const searchWithPatient = new URLSearchParams(entries).toString();
    return normalizeCommunicationSearch({
      search: searchWithPatient,
    });
  }, [hasPatient, params, patientRef]);

  useEffect(() => {
    if (normalizedSearch !== currentSearch) {
      const prefix = normalizedSearch ? `?${normalizedSearch}` : '';
      navigate(`/Patient/${patientId}/Communication${prefix}`, { replace: true })?.catch(console.error);
    }
  }, [currentSearch, navigate, normalizedSearch, patientId]);

  const onChange = (search: SearchRequest): void => {
    navigate(`/Patient/${patientId}/Communication${formatSearchQuery(search)}`)?.catch(console.error);
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

  return (
    <div style={{ height: `calc(100vh - 98px)` }}>
      <ThreadInbox
        threadId={messageId}
        query={formatSearchQuery(parsedSearch).substring(1)}
        subject={{ reference: patientRef }}
        showPatientSummary={false}
        onNew={onNew}
        getThreadUri={getThreadUri}
        onChange={onChange}
        inProgressUri={inProgressUri}
        completedUri={completedUri}
      />
    </div>
  );
}
