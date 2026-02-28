// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { formatSearchQuery, Operator, parseSearchRequest } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { ThreadInbox } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import classes from './MessagesPage.module.css';

function normalizeSearch(search: string): { normalizedSearch: string; parsedSearch: SearchRequest } {
  const params = new URLSearchParams(search || '_sort=-_lastUpdated');
  if (!params.has('_sort')) params.set('_sort', '-_lastUpdated');
  if (!params.has('status')) params.set('status', 'in-progress');
  if (!params.has('_count')) params.set('_count', '20');
  if (!params.has('_total')) params.set('_total', 'accurate');
  const normalizedSearch = params.toString();
  return { normalizedSearch, parsedSearch: parseSearchRequest(`Communication?${normalizedSearch}`) };
}

export function Messages(): JSX.Element {
  const { messageId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const currentSearch = useMemo(() => (location.search ? location.search.substring(1) : ''), [location.search]);

  const { normalizedSearch, parsedSearch } = useMemo(() => normalizeSearch(currentSearch), [currentSearch]);

  useEffect(() => {
    const isDetailView = Boolean(messageId);
    if (!isDetailView && normalizedSearch !== currentSearch) {
      const prefix = normalizedSearch ? `?${normalizedSearch}` : '';
      navigate(`/messages${prefix}`, { replace: true })?.catch(console.error);
    }
  }, [currentSearch, navigate, normalizedSearch, messageId]);

  const onChange = (search: SearchRequest): void => {
    navigate(`/messages${formatSearchQuery(search)}`)?.catch(console.error);
  };

  const getThreadUri = (topic: Communication): string => {
    return `/messages/${topic.id}${formatSearchQuery(parsedSearch)}`;
  };

  const buildStatusSearch = (value: Communication['status']): SearchRequest => {
    const otherFilters = parsedSearch.filters?.filter((f) => f.code !== 'status') || [];
    const newFilters = [...otherFilters, { code: 'status', operator: Operator.EQUALS, value }];
    return { ...parsedSearch, filters: newFilters, offset: 0 };
  };

  const inProgressUri = `/messages${formatSearchQuery(buildStatusSearch('in-progress'))}`;
  const completedUri = `/messages${formatSearchQuery(buildStatusSearch('completed'))}`;

  const onNew = (message: Communication): void => {
    navigate(getThreadUri(message))?.catch(console.error);
  };

  return (
    <div className={classes.container}>
      <ThreadInbox
        threadId={messageId}
        query={formatSearchQuery(parsedSearch).substring(1)}
        onNew={onNew}
        getThreadUri={getThreadUri}
        onChange={onChange}
        inProgressUri={inProgressUri}
        completedUri={completedUri}
      />
    </div>
  );
}
