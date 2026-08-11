// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { formatSearchQuery, getReferenceString, Operator } from '@medplum/core';
import type { Task } from '@medplum/fhirtypes';
import { Loading, useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { TaskBoard } from '../../components/tasks/TaskBoard';
import { useNewInUrl } from '../../hooks/useNewInUrl';
import { normalizeTaskSearch } from '../../utils/task-search';
import classes from '../tasks/TasksPage.module.css';

export function TasksTab(): JSX.Element {
  const { patientId, taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useMedplumProfile();
  const [parsedSearch, setParsedSearch] = useState<SearchRequest>();
  const patientRef = `Patient/${patientId}`;

  const basePath = taskId ? `/Patient/${patientId}/Task/${taskId}` : `/Patient/${patientId}/Task`;
  const {
    isNew: isNewTask,
    openNew: onNewTaskOpen,
    closeNew: onNewTaskClose,
  } = useNewInUrl(basePath, parsedSearch ? formatSearchQuery(parsedSearch) : '');

  useEffect(() => {
    const { normalizedSearch, needsNavigation } = normalizeTaskSearch(location.pathname, location.search, {
      additionalFilters: [
        {
          code: 'patient',
          operator: Operator.EQUALS,
          value: patientRef,
        },
      ],
    });

    if (needsNavigation) {
      navigate(`${isNewTask ? `${basePath}/new` : basePath}${formatSearchQuery(normalizedSearch)}`)?.catch(
        console.error
      );
    } else {
      setParsedSearch(normalizedSearch);
    }
  }, [location, navigate, patientRef, isNewTask, basePath]);

  if (!parsedSearch) {
    return <Loading />;
  }

  const onNew = (task: Task): void => {
    navigate(`/Patient/${patientId}/Task/${task.id}${formatSearchQuery(parsedSearch)}`)?.catch(console.error);
  };

  // Preserve the /new suffix so auto-selecting a task keeps the new task modal open.
  const getTaskUri = (task: Task): string => {
    return `/Patient/${patientId}/Task/${task.id}${isNewTask ? '/new' : ''}${formatSearchQuery(parsedSearch)}`;
  };

  const onDelete = (_: Task): void => {
    navigate(`/Patient/${patientId}/Task${formatSearchQuery(parsedSearch)}`)?.catch(console.error);
  };

  const onChange = (search: SearchRequest): void => {
    // Keep the selected task open when the list search changes (pagination, filters)
    navigate(`${basePath}${formatSearchQuery(search)}`)?.catch(console.error);
  };

  const myTasksFilters = parsedSearch.filters?.filter((f) => f.code !== 'owner' && f.code !== 'patient') || [];
  myTasksFilters.push({
    code: 'patient',
    operator: Operator.EQUALS,
    value: patientRef,
  });
  if (profile) {
    const profileRef = getReferenceString(profile);
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
    <div className={classes.container} style={{ height: '100%' }}>
      <TaskBoard
        query={formatSearchQuery(parsedSearch).substring(1)}
        selectedTaskId={taskId}
        onDelete={onDelete}
        onNew={onNew}
        onChange={onChange}
        getTaskUri={getTaskUri}
        newTaskOpened={isNewTask}
        onNewTaskOpen={onNewTaskOpen}
        onNewTaskClose={onNewTaskClose}
        myTasksUri={
          myTasksQuery ? `/Patient/${patientId}/Task?${myTasksQuery.substring(1)}` : `/Patient/${patientId}/Task`
        }
        allTasksUri={
          allTasksQuery ? `/Patient/${patientId}/Task?${allTasksQuery.substring(1)}` : `/Patient/${patientId}/Task`
        }
      />
    </div>
  );
}
