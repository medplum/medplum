// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Flex, Paper, ScrollArea, Skeleton, Stack, Text } from '@mantine/core';
import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { CodeableConcept, Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import cx from 'clsx';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import { TaskListItem } from '../../components/tasks/TaskListItem';
import { TaskFilterMenu } from '../../components/tasks/TaskFilterMenu';
import { TaskFilterType, TaskFilterValue } from '../../components/tasks/TaskFilterMenu.utils';
import { showErrorNotification } from '../../utils/notifications';
import classes from './TasksPage.module.css';
import { IconClipboardList } from '@tabler/icons-react';

interface FilterState {
  showMyTasks: boolean;
  status: Task['status'] | undefined;
  performerType: CodeableConcept | undefined;
}

export function TasksPage(): JSX.Element {
  const { taskId } = useParams();
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [notFound, setNotFound] = useState<boolean>(false);
  const profileRef = useMemo(() => (profile ? createReference(profile as ProfileResource) : undefined), [profile]);

  const [performerTypes, setPerformerTypes] = useState<CodeableConcept[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    showMyTasks: true,
    status: undefined,
    performerType: undefined,
  });

  useEffect(() => {
    const fetchTasks = async (): Promise<void> => {
      const searchParams = new URLSearchParams();
      searchParams.append('_sort', '-_lastUpdated');

      if (profileRef && filters.showMyTasks) {
        searchParams.append('owner', getReferenceString(profileRef));
      }
      if (filters.status) {
        searchParams.append('status', filters.status);
      }

      let results: Task[] = await medplum.searchResources('Task', searchParams, { cache: 'no-cache' });
      const performerTypes = results.flatMap((task) => task.performerType || []);

      if (filters.performerType) {
        results = results.filter(
          (task) => task.performerType?.[0]?.coding?.[0]?.code === filters.performerType?.coding?.[0]?.code
        );
      }

      setPerformerTypes(performerTypes);
      setTasks(results);
    };

    setLoading(true);
    fetchTasks()
      .catch(showErrorNotification)
      .finally(() => setLoading(false));
  }, [medplum, profileRef, filters]); // Single dependency for all filter state

  useEffect(() => {
    const handleTaskSelection = async (): Promise<void> => {
      if (taskId) {
        const task = tasks.find((task) => task.id === taskId);
        if (task) {
          setSelectedTask(task);
        } else {
          const task = await medplum.readResource('Task', taskId);
          setSelectedTask(task);
        }
      }
    };

    setNotFound(false);
    handleTaskSelection().catch(() => {
      setNotFound(true);
    });
  }, [taskId, tasks, medplum, navigate]);

  const handleTaskChange = (task: Task): void => {
    setSelectedTask(task);
    setTasks(tasks.map((t) => (t.id === task.id ? task : t)));
  };

  const handleDeleteTask = (task: Task): void => {
    setTasks(tasks.filter((t) => t.id !== task.id));
    setSelectedTask(undefined);
  };

  const handleFilterChange = (filterType: TaskFilterType, value: TaskFilterValue): void => {
    switch (filterType) {
      case TaskFilterType.STATUS:
        setFilters((prev) => ({
          ...prev,
          status: prev.status !== value ? (value as Task['status']) : undefined,
        }));
        break;
      case TaskFilterType.PERFORMER_TYPE: {
        const performerTypeCode = filters.performerType?.coding?.[0]?.code;
        const valueCode = (value as CodeableConcept)?.coding?.[0]?.code;
        setFilters((prev) => ({
          ...prev,
          performerType: performerTypeCode !== valueCode ? (value as CodeableConcept) : undefined,
        }));
        break;
      }
      default:
        break;
    }
  };

  const handleShowMyTasksChange = (flag: boolean): void => {
    // Single state update that resets all filters atomically
    setFilters({
      showMyTasks: flag,
      status: undefined,
      performerType: undefined,
    });
  };

  return (
    <div className={classes.container}>
      <Flex h="100%" w="100%">
        <Flex direction="column" w="40%" h="100%" className={classes.borderRight}>
          <Paper>
            <Flex p="md" gap="xs" align="center" h={72}>
              <Button
                className={cx(classes.button, { [classes.selected]: filters.showMyTasks })}
                h={32}
                radius="xl"
                onClick={() => handleShowMyTasksChange(true)}
              >
                My Tasks
              </Button>

              <Button
                className={cx(classes.button, { [classes.selected]: !filters.showMyTasks })}
                h={32}
                radius="xl"
                onClick={() => handleShowMyTasksChange(false)}
              >
                All Tasks
              </Button>

              <TaskFilterMenu
                status={filters.status}
                performerType={filters.performerType}
                performerTypes={performerTypes}
                onFilterChange={handleFilterChange}
              />
            </Flex>
          </Paper>
          <Divider />
          <Paper h="calc(100% - 60px)" id="task-list">
            <ScrollArea h="100%" id="task-list-scrollarea">
              {loading && <TaskListSkeleton />}
              {!loading && tasks.length === 0 && <EmptyTasksState />}
              {!loading &&
                tasks.length > 0 &&
                tasks.map((task, index) => (
                  <React.Fragment key={task.id}>
                    <TaskListItem task={task} selectedTask={selectedTask} />
                    {index < tasks.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
            </ScrollArea>
          </Paper>
        </Flex>

        <Outlet
          context={{ notFound, task: selectedTask, onTaskChange: handleTaskChange, onDeleteTask: handleDeleteTask }}
        />
      </Flex>
    </div>
  );
}

function EmptyTasksState(): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center">
      <Stack align="center" gap="md" pt="xl">
        <IconClipboardList size={64} color="var(--mantine-color-gray-4)" />
        <Text size="lg" c="dimmed" fw={500}>
          No tasks found
        </Text>
      </Stack>
    </Flex>
  );
}

function TaskListSkeleton(): JSX.Element {
  return (
    <Stack gap="md" p="md">
      {Array.from({ length: 6 }).map((_, index) => (
        <Stack key={index}>
          <Flex direction="column" gap="xs" align="flex-start">
            <Skeleton height={16} width={`${Math.random() * 40 + 60}%`} />
            <Skeleton height={14} width={`${Math.random() * 50 + 40}%`} />
            <Skeleton height={14} width={`${Math.random() * 50 + 40}%`} />
          </Flex>
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}
