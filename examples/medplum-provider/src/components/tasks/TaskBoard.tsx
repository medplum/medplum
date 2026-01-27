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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import cx from 'clsx';
import classes from './TaskBoard.module.css';
import type { CodeableConcept, Task } from '@medplum/fhirtypes';
import { Operator, parseSearchRequest } from '@medplum/core';
import type { SearchRequest } from '@medplum/core';
import { Link, useNavigate } from 'react-router';
import { useMedplum } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';
import { TaskFilterType } from './TaskFilterMenu.utils';
import type { TaskFilterValue } from './TaskFilterMenu.utils';
import { TaskFilterMenu } from './TaskFilterMenu';
import { IconPlus } from '@tabler/icons-react';
import { TaskListItem } from './TaskListItem';
import { TaskSelectEmpty } from './TaskSelectEmpty';
import { NewTaskModal } from './NewTaskModal';
import { TaskDetailPanel } from './TaskDetailPanel';

interface FilterState {
  performerType: CodeableConcept | undefined;
}

/**
 * TaskBoardProps is the props for the TaskBoard component.
 * @property query - The query string for the search request.
 * @property selectedTaskId - The ID of the selected task.
 * @property onDelete - The function to call when a task is deleted.
 * @property onNew - The function to call when a new task is created.
 * @property onChange - The function to call when the search request changes.
 * @property getTaskUri - The function to call to get the URI of a task.
 * @property myTasksUri - The URI for the my tasks search request.
 * @property allTasksUri - The URI for the all tasks search request.
 * @returns The TaskBoard component.
 */
interface TaskBoardProps {
  query: string;
  selectedTaskId: string | undefined;
  onDelete: (task: Task) => void;
  onNew: (task: Task) => void;
  onChange: (search: SearchRequest) => void;
  getTaskUri: (task: Task) => string;
  myTasksUri: string;
  allTasksUri: string;
}

export function TaskBoard({
  query,
  selectedTaskId,
  onDelete,
  onNew,
  onChange,
  getTaskUri,
  myTasksUri,
  allTasksUri,
}: TaskBoardProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [performerTypes, setPerformerTypes] = useState<CodeableConcept[]>([]);
  const [newTaskModalOpened, setNewTaskModalOpened] = useState<boolean>(false);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const requestIdRef = useRef<number>(0);
  const fetchingRef = useRef<boolean>(false);

  const [filters, setFilters] = useState<FilterState>({
    performerType: undefined,
  });

  // Parse pagination and status filters from query
  const searchParams = useMemo(() => new URLSearchParams(query), [query]);
  const itemsPerPage = Number.parseInt(searchParams.get('_count') || '20', 10);
  const currentOffset = Number.parseInt(searchParams.get('_offset') || '0', 10);
  const currentPage = Math.floor(currentOffset / itemsPerPage) + 1;
  const isMyTasks = searchParams.has('owner');

  // Parse current search from query string
  const currentSearch = useMemo(() => parseSearchRequest(`Task?${query}`), [query]);

  // Parse status filters from query string
  const selectedStatuses = useMemo(() => {
    const statusFilters = currentSearch.filters?.filter((f) => f.code === 'status') || [];
    const statuses: Task['status'][] = [];
    statusFilters.forEach((filter) => {
      const values = filter.value.split(',');
      values.forEach((value) => {
        const trimmedValue = value.trim();
        if (trimmedValue && !statuses.includes(trimmedValue as Task['status'])) {
          statuses.push(trimmedValue as Task['status']);
        }
      });
    });
    return statuses;
  }, [currentSearch]);

  // Parse priority filters from query string
  const selectedPriorities = useMemo(() => {
    const priorityFilters = currentSearch.filters?.filter((f) => f.code === 'priority') || [];
    const priorities: Task['priority'][] = [];
    priorityFilters.forEach((filter) => {
      const values = filter.value.split(',');
      values.forEach((value) => {
        const trimmedValue = value.trim();
        if (trimmedValue && !priorities.includes(trimmedValue as Task['priority'])) {
          priorities.push(trimmedValue as Task['priority']);
        }
      });
    });
    return priorities;
  }, [currentSearch]);

  const fetchTasks = useCallback(async (): Promise<void> => {
    if (fetchingRef.current) {
      return;
    }
    fetchingRef.current = true;
    const currentRequestId = ++requestIdRef.current;

    try {
      const bundle = await medplum.search('Task', query, { cache: 'no-cache' });

      if (currentRequestId !== requestIdRef.current) {
        return;
      }

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
    } catch (error) {
      if (currentRequestId === requestIdRef.current) {
        throw error;
      }
    } finally {
      fetchingRef.current = false;
    }
  }, [medplum, filters.performerType, query]);

  useEffect(() => {
    setLoading(true);
    fetchTasks()
      .catch(showErrorNotification)
      .finally(() => setLoading(false));
  }, [fetchTasks]);

  // Auto-select first task when list loads and no task is selected, or when selected task is not in list
  useEffect(() => {
    if (!loading && tasks.length > 0) {
      const selectedTaskInList = selectedTaskId && tasks.some((task) => task.id === selectedTaskId);
      if (!selectedTaskInList) {
        const firstTask = tasks[0];
        if (firstTask?.id) {
          navigate(getTaskUri(firstTask))?.catch(console.error);
        }
      }
    }
  }, [loading, tasks, selectedTaskId, navigate, getTaskUri]);

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
    onNew(task);
  };

  const handleTaskChange = async (_task: Task): Promise<void> => {
    await fetchTasks().catch(showErrorNotification);
  };

  const handleDeleteTask = async (task: Task): Promise<void> => {
    await fetchTasks().catch(showErrorNotification);
    onDelete(task);
  };

  const handleFilterChange = (filterType: TaskFilterType, value: TaskFilterValue): void => {
    switch (filterType) {
      case TaskFilterType.STATUS: {
        const statusValue = value as Task['status'];
        const newStatuses = selectedStatuses.includes(statusValue)
          ? selectedStatuses.filter((s) => s !== statusValue)
          : [...selectedStatuses, statusValue];

        const otherFilters = currentSearch.filters?.filter((f) => f.code !== 'status') || [];
        const newFilters = [...otherFilters];

        if (newStatuses.length > 0) {
          newFilters.push({
            code: 'status',
            operator: Operator.EQUALS,
            value: newStatuses.join(','),
          });
        }

        onChange({
          ...currentSearch,
          filters: newFilters,
          offset: 0,
        });
        break;
      }
      case TaskFilterType.PRIORITY: {
        const priorityValue = value as Task['priority'];
        const newPriorities = selectedPriorities.includes(priorityValue)
          ? selectedPriorities.filter((p) => p !== priorityValue)
          : [...selectedPriorities, priorityValue];

        const otherFilters = currentSearch.filters?.filter((f) => f.code !== 'priority') || [];
        const newFilters = [...otherFilters];

        if (newPriorities.length > 0) {
          newFilters.push({
            code: 'priority',
            operator: Operator.EQUALS,
            value: newPriorities.join(','),
          });
        }

        onChange({
          ...currentSearch,
          filters: newFilters,
          offset: 0,
        });
        break;
      }
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

  return (
    <Box w="100%" h="100%">
      <Flex h="100%">
        <Box w={350} h="100%">
          <Flex direction="column" h="100%" className={classes.borderRight}>
            <Paper>
              <Flex h={64} align="center" justify="space-between" p="md">
                <Group gap="xs">
                  <Button
                    component={Link}
                    to={myTasksUri}
                    className={cx(classes.button, { [classes.selected]: isMyTasks })}
                    h={32}
                    radius="xl"
                  >
                    My Tasks
                  </Button>

                  <Button
                    component={Link}
                    to={allTasksUri}
                    className={cx(classes.button, { [classes.selected]: !isMyTasks })}
                    h={32}
                    radius="xl"
                  >
                    All Tasks
                  </Button>

                  <TaskFilterMenu
                    statuses={selectedStatuses}
                    priorities={selectedPriorities}
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
                      <TaskListItem task={task} selectedTask={selectedTask} getTaskUri={getTaskUri} />
                      {index < tasks.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
              </ScrollArea>
              {!loading && total !== undefined && total > itemsPerPage && (
                <Box p="md">
                  <Center>
                    <Pagination
                      value={currentPage}
                      total={Math.ceil(total / itemsPerPage)}
                      onChange={(page) => {
                        const offset = (page - 1) * itemsPerPage;
                        onChange({
                          ...currentSearch,
                          offset,
                        });
                      }}
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
    <Flex direction="column" h="100%" justify="center" align="center" pt="xl">
      <Text c="dimmed" fw={500}>
        No tasks available.
      </Text>
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
