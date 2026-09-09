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
import classes from './TasksPage.module.css';

export function TasksPage(): JSX.Element {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useMedplumProfile();
  const [parsedSearch, setParsedSearch] = useState<SearchRequest>();

  const basePath = taskId ? `/Task/${taskId}` : '/Task';
  const {
    isNew: isNewTask,
    openNew: onNewTaskOpen,
    closeNew: onNewTaskClose,
  } = useNewInUrl(basePath, parsedSearch ? formatSearchQuery(parsedSearch) : '');

  useEffect(() => {
    const { normalizedSearch, needsNavigation } = normalizeTaskSearch(location.pathname, location.search);
    if (needsNavigation) {
      navigate(`${isNewTask ? `${basePath}/new` : basePath}${formatSearchQuery(normalizedSearch)}`)?.catch(
        console.error
      );
    } else {
      setParsedSearch(normalizedSearch);
    }
  }, [location, navigate, isNewTask, basePath]);

  if (!parsedSearch) {
    return <Loading />;
  }

  const onNew = (task: Task): void => {
    navigate(`/Task/${task.id}${formatSearchQuery(parsedSearch)}`)?.catch(console.error);
  };

  // Preserve the /new suffix so auto-selecting a task keeps the new task modal open.
  const getTaskUri = (task: Task): string => {
    return `/Task/${task.id}${isNewTask ? '/new' : ''}${formatSearchQuery(parsedSearch)}`;
  };

  const onDelete = (_: Task): void => {
    navigate(`/Task${formatSearchQuery(parsedSearch)}`)?.catch(console.error);
  };

  const onChange = (search: SearchRequest): void => {
    // Keep the selected task open when the list search changes (pagination, filters)
    const basePath = taskId ? `/Task/${taskId}` : '/Task';
    navigate(`${basePath}${formatSearchQuery(search)}`)?.catch(console.error);
  };

  const myTasksFilters = parsedSearch.filters?.filter((f) => f.code !== 'owner') || [];
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
        newTaskOpened={isNewTask}
        onNewTaskOpen={onNewTaskOpen}
        onNewTaskClose={onNewTaskClose}
        myTasksUri={myTasksQuery ? `/Task?${myTasksQuery.substring(1)}` : '/Task'}
        allTasksUri={allTasksQuery ? `/Task?${allTasksQuery.substring(1)}` : '/Task'}
      />
    </div>
  );
}
