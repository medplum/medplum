// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Task } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import classes from '../tasks/TasksPage.module.css';
import { TaskBoard } from '../../components/tasks/TaskBoard';
import { formatSearchQuery, getReferenceString, parseSearchRequest, Operator } from '@medplum/core';
import type { ProfileResource, SearchRequest } from '@medplum/core';
import { Loading, useMedplumProfile } from '@medplum/react';

export function TasksTab(): JSX.Element {
  const { patientId, taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useMedplumProfile();
  const [parsedSearch, setParsedSearch] = useState<SearchRequest>();
  const patientRef = `Patient/${patientId}`;

  useEffect(() => {
    const parsedSearch = parseSearchRequest(location.pathname + location.search);
    const lastUpdatedSortRule = parsedSearch.sortRules?.find((rule) => rule.code === '_lastUpdated');
    
    const otherFilters = parsedSearch.filters?.filter((f) => f.code !== 'patient') || [];

    const updatedFilters = [
      ...otherFilters,
      {
        code: 'patient',
        operator: Operator.EQUALS,
        value: patientRef,
      },
    ];

    const searchWithPatient: SearchRequest = {
      ...parsedSearch,
      filters: updatedFilters,
      sortRules: lastUpdatedSortRule
        ? parsedSearch.sortRules
        : [{ code: '_lastUpdated', descending: true }],
      count: parsedSearch.count || 20,
      total: parsedSearch.total || 'accurate',
    };

    if (!lastUpdatedSortRule || !parsedSearch.count || !parsedSearch.total) {
      navigate(`/Patient/${patientId}/Task${formatSearchQuery(searchWithPatient)}`)?.catch(console.error);
    } else {
      setParsedSearch(searchWithPatient);
    }
  }, [location, navigate, patientId, patientRef]);

  if (!parsedSearch) {
    return <Loading />;
  }

  const onNew = (task: Task): void => {
    navigate(getTaskUri(task))?.catch(console.error);
  };

  const getTaskUri = (task: Task): string => {
    return `/Patient/${patientId}/Task/${task.id}${formatSearchQuery(parsedSearch)}`;
  };

  const onDelete = (_: Task): void => {
    navigate(`/Patient/${patientId}/Task${formatSearchQuery(parsedSearch)}`)?.catch(console.error);
  };

  const onChange = (search: SearchRequest): void => {
    navigate(`/Patient/${patientId}/Task${formatSearchQuery(search)}`)?.catch(console.error);
  };

  const myTasksFilters = parsedSearch.filters?.filter((f) => f.code !== 'owner' && f.code !== 'patient') || [];
  myTasksFilters.push({
    code: 'patient',
    operator: Operator.EQUALS,
    value: patientRef,
  });
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

  const allTasksFilters = parsedSearch.filters?.filter((f) => f.code !== 'owner' && f.code !== 'patient') || [];
  allTasksFilters.push({
    code: 'patient',
    operator: Operator.EQUALS,
    value: patientRef,
  });
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
        myTasksUri={myTasksQuery ? `/Patient/${patientId}/Task?${myTasksQuery.substring(1)}` : `/Patient/${patientId}/Task`}
        allTasksUri={allTasksQuery ? `/Patient/${patientId}/Task?${allTasksQuery.substring(1)}` : `/Patient/${patientId}/Task`}
      />
    </div>
  );
}
