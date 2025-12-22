// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Task } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import classes from './TasksPage.module.css';
import { TaskBoard } from '../../components/tasks/TaskBoard';
import { formatSearchQuery, getReferenceString, parseSearchRequest, Operator } from '@medplum/core';
import type { ProfileResource, SearchRequest } from '@medplum/core';
import { Loading, useMedplumProfile } from '@medplum/react';

export function TasksPage(): JSX.Element {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useMedplumProfile();
  const [parsedSearch, setParsedSearch] = useState<SearchRequest>();

  useEffect(() => {
    const parsedSearch = parseSearchRequest(location.pathname + location.search);
    const lastUpdatedSortRule = parsedSearch.sortRules?.find((rule) => rule.code === '_lastUpdated');
    if (!parsedSearch.count || !parsedSearch.total || !lastUpdatedSortRule) {
      navigate(
        `/Task${formatSearchQuery({
          ...parsedSearch,
          sortRules: [{ code: '_lastUpdated', descending: true }],
          count: 20,
          total: 'accurate',
        })}`
      )?.catch(console.error);
    } else {
      setParsedSearch(parsedSearch);
    }
  }, [location, navigate]);

  if (!parsedSearch) {
    return <Loading />;
  }

  const onNew = (task: Task): void => {
    navigate(getTaskUri(task))?.catch(console.error);
  };

  const getTaskUri = (task: Task): string => {
    return `/Task/${task.id}${formatSearchQuery(parsedSearch)}`;
  };

  const onDelete = (_: Task): void => {
    navigate(`/Task${formatSearchQuery(parsedSearch)}`)?.catch(console.error);
  };

  const onChange = (search: SearchRequest): void => {
    navigate(`/Task${formatSearchQuery(search)}`)?.catch(console.error);
  };

  const myTasksFilters = parsedSearch.filters?.filter((f) => f.code !== 'owner') || [];
  if (profile) {
    const profileRef = getReferenceString(profile as ProfileResource);
    if (profileRef) {
      myTasksFilters.push({
        code: 'owner',
        operator: Operator.EQUALS,
        value: profileRef,
      });
    }
  }
  const myTasksSearch: SearchRequest = {
    ...parsedSearch,
    filters: myTasksFilters,
    offset: 0, 
  };

  const allTasksFilters = parsedSearch.filters?.filter((f) => f.code !== 'owner') || [];
  const allTasksSearch: SearchRequest = {
    ...parsedSearch,
    filters: allTasksFilters,
    offset: 0, 
  };

  const myTasksQuery = formatSearchQuery(myTasksSearch);
  const allTasksQuery = formatSearchQuery(allTasksSearch);

  return (
    <div className={classes.container}>
      <TaskBoard
        query={formatSearchQuery(parsedSearch).substring(1)}
        selectedTaskId={taskId}
        onDelete={onDelete}
        onNew={onNew}
        onChange={onChange}
        getTaskUri={getTaskUri}
        myTasksUri={myTasksQuery ? `/Task?${myTasksQuery.substring(1)}` : '/Task'}
        allTasksUri={allTasksQuery ? `/Task?${allTasksQuery.substring(1)}` : '/Task'}
      />
    </div>
  );
}
