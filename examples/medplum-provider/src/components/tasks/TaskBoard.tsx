// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Flex,
  Paper,
  Group,
  Button,
  Divider,
  ActionIcon,
  ScrollArea,
  Stack,
  Skeleton,
  Text,
  Box,
  Pagination,
  Center,
} from '@mantine/core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import cx from 'clsx';
import classes from './TaskBoard.module.css';
import type { CodeableConcept, Task } from '@medplum/fhirtypes';
import { createReference, getReferenceString } from '@medplum/core';
import type { ProfileResource } from '@medplum/core';
import { useNavigate } from 'react-router';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';
import { TaskFilterType } from './TaskFilterMenu.utils';
import type { TaskFilterValue } from './TaskFilterMenu.utils';
import { TaskFilterMenu } from './TaskFilterMenu';
import { IconClipboardList, IconPlus } from '@tabler/icons-react';
import { TaskListItem } from './TaskListItem';
import { TaskSelectEmpty } from './TaskSelectEmpty';
import { NewTaskModal } from './NewTaskModal';
import { TaskDetailPanel } from './TaskDetailPanel';

interface FilterState {
  showMyTasks: boolean;
  status: Task['status'] | undefined;
  performerType: CodeableConcept | undefined;
}

interface TaskBoardProps {
  query: string;
  selectedTaskId: string | undefined;
  onTaskChange: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onSelectedItem: (task: Task) => string;
}

export function TaskBoard(props: TaskBoardProps): JSX.Element {
  const { query, selectedTaskId, onTaskChange, onDeleteTask, onSelectedItem } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const profileRef = useMemo(() => (profile ? createReference(profile as ProfileResource) : undefined), [profile]);
  const [performerTypes, setPerformerTypes] = useState<CodeableConcept[]>([]);
  const [newTaskModalOpened, setNewTaskModalOpened] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const [filters, setFilters] = useState<FilterState>({
    showMyTasks: true,
    status: undefined,
    performerType: undefined,
  });

  const itemsPerPage = 20;

  const fetchTasks = useCallback(async (): Promise<void> => {
    const searchParams = new URLSearchParams(query);

    if (profileRef && filters.showMyTasks) {
      searchParams.append('owner', getReferenceString(profileRef));
    }
    if (filters.status) {
      searchParams.append('status', filters.status);
    }

    const offset = (currentPage - 1) * itemsPerPage;
    searchParams.append('_offset', offset.toString());
    searchParams.append('_count', itemsPerPage.toString());
    searchParams.append('_total', 'accurate');

    const bundle = await medplum.search('Task', searchParams.toString(), { cache: 'no-cache' });
    let results: Task[] = [];

    if (bundle.entry) {
      results = bundle.entry.map((entry) => entry.resource as Task).filter((r): r is Task => r !== undefined);
    }

    if (bundle.total !== undefined) {
      setTotal(bundle.total);
    }

    const allPerformerTypes = results.flatMap((task) => task.performerType || []);

    if (filters.performerType) {
      results = results.filter(
        (task) => task.performerType?.[0]?.coding?.[0]?.code === filters.performerType?.coding?.[0]?.code
      );
    }

    setPerformerTypes(allPerformerTypes);
    setTasks(results);
  }, [medplum, profileRef, filters, query, currentPage, itemsPerPage]);

  useEffect(() => {
    setLoading(true);
    fetchTasks()
      .catch(showErrorNotification)
      .finally(() => setLoading(false));
  }, [medplum, profileRef, filters, query, fetchTasks]);

  useEffect(() => {
    const handleTaskSelection = async (): Promise<void> => {
      if (selectedTaskId) {
        const task = tasks.find((task: Task) => task.id === selectedTaskId);
        if (task) {
          setSelectedTask(task);
        } else {
          const task = await medplum.readResource('Task', selectedTaskId);
          setSelectedTask(task);
        }
      } else {
        setSelectedTask(undefined);
      }
    };

    handleTaskSelection().catch(() => {
      setSelectedTask(undefined);
    });
  }, [selectedTaskId, tasks, medplum, navigate]);

  const handleNewTaskCreated = (task: Task): void => {
    fetchTasks().catch(showErrorNotification);
    handleTaskChange(task).catch(showErrorNotification);
  };

  const handleTaskChange = async (task: Task): Promise<void> => {
    setTasks(tasks.map((t) => (t.id === task.id ? task : t)));
    onTaskChange(task);
    setSelectedTask(task);
  };

  const handleDeleteTask = async (task: Task): Promise<void> => {
    setTasks(tasks.filter((t) => t.id !== task.id));
    onDeleteTask(task);
  };

  const handleFilterChange = (filterType: TaskFilterType, value: TaskFilterValue): void => {
    setCurrentPage(1);
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
    setCurrentPage(1);
    setFilters({
      showMyTasks: flag,
      status: undefined,
      performerType: undefined,
    });
  };

  const totalPages = total !== undefined ? Math.ceil(total / itemsPerPage) : 1;

  return (
    <Box w="100%" h="100%">
      <Flex h="100%">
        <Box w={350} h="100%">
          <Flex direction="column" h="100%" className={classes.borderRight}>
            <Paper>
              <Flex h={64} align="center" justify="space-between" p="md">
                <Group gap="xs">
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
                </Group>

                <ActionIcon radius="50%" variant="filled" color="blue" onClick={() => setNewTaskModalOpened(true)}>
                  <IconPlus size={16} />
                </ActionIcon>
              </Flex>
            </Paper>

            <Divider />
            <Paper style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ScrollArea style={{ flex: 1 }} id="task-list-scrollarea">
                {loading && <TaskListSkeleton />}
                {!loading && tasks.length === 0 && <EmptyTasksState />}
                {!loading &&
                  tasks.length > 0 &&
                  tasks.map((task, index) => (
                    <React.Fragment key={task.id}>
                      <TaskListItem task={task} selectedTask={selectedTask} onSelectedItem={onSelectedItem} />
                      {index < tasks.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
              </ScrollArea>
              {!loading && total !== undefined && total > itemsPerPage && (
                <Box p="md">
                  <Center>
                    <Pagination
                      value={currentPage}
                      total={totalPages}
                      onChange={setCurrentPage}
                      size="sm"
                      siblings={1}
                      boundaries={1}
                    />
                  </Center>
                </Box>
              )}
            </Paper>
          </Flex>
        </Box>

        {selectedTask ? (
          <TaskDetailPanel task={selectedTask} onTaskChange={handleTaskChange} onDeleteTask={handleDeleteTask} />
        ) : (
          <Flex direction="column" h="100%" style={{ flex: 1 }}>
            <TaskSelectEmpty />
          </Flex>
        )}
      </Flex>

      <NewTaskModal
        opened={newTaskModalOpened}
        onClose={() => setNewTaskModalOpened(false)}
        onTaskCreated={handleNewTaskCreated}
      />
    </Box>
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
