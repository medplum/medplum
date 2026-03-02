// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { formatSearchQuery, getReferenceString, Operator } from '@medplum/core';
import type { Communication, DocumentReference, Reference } from '@medplum/fhirtypes';
import { ThreadInbox } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { DoseSpotPharmacyDialog } from '../../components/pharmacy/DoseSpotPharmacyDialog';
import { normalizeCommunicationSearch } from '../../utils/communication-search';
import classes from './MessagesPage.module.css';
/**
 * Fetches
 * @returns A React component that displays all Threads/Topics.
 */
export function MessagesPage(): JSX.Element {
  const { messageId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const medplum = useMedplum();

  const currentSearch = useMemo(() => (location.search ? location.search.substring(1) : ''), [location.search]);

  const { normalizedSearch, parsedSearch } = useMemo(
    () =>
      normalizeCommunicationSearch({
        search: currentSearch,
      }),
    [currentSearch]
  );

  useEffect(() => {
    const isDetailView = Boolean(messageId);
    if (!isDetailView && normalizedSearch !== currentSearch) {
      const prefix = normalizedSearch ? `?${normalizedSearch}` : '';
      navigate(`/Communication${prefix}`, { replace: true })?.catch(console.error);
    }
  }, [currentSearch, navigate, normalizedSearch, messageId]);

  const onChange = (search: SearchRequest): void => {
    navigate(`/Communication${formatSearchQuery(search)}`)?.catch(console.error);
  };

  const getThreadUri = (topic: Communication): string => {
    return `/Communication/${topic.id}${formatSearchQuery(parsedSearch)}`;
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

  const inProgressUri = `/Communication${formatSearchQuery(buildStatusSearch('in-progress'))}`;
  const completedUri = `/Communication${formatSearchQuery(buildStatusSearch('completed'))}`;

  const onNew = (message: Communication): void => {
    navigate(getThreadUri(message))?.catch(console.error);
  };

  const onViewInDocuments = (reference: Reference<DocumentReference>): void => {
    medplum
      .readReference(reference)
      .then((docRef) => {
        const subject = docRef.subject?.reference;
        const path = subject ? `/${subject}/${getReferenceString(reference)}` : `/${getReferenceString(reference)}`;
        navigate(path)?.catch(console.error);
      })
      .catch(console.error);
  };

  return (
    <div className={classes.container}>
      <ThreadInbox
        threadId={messageId}
        query={formatSearchQuery(parsedSearch).substring(1)}
        showPatientSummary={true}
        pharmacyDialogComponent={DoseSpotPharmacyDialog}
        onNew={onNew}
        getThreadUri={getThreadUri}
        onViewInDocuments={onViewInDocuments}
        onChange={onChange}
        inProgressUri={inProgressUri}
        completedUri={completedUri}
        uploadEnabled={true}
      />
    </div>
  );
}
