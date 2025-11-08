// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Flex, Paper, Divider, ActionIcon, ScrollArea, Stack, Skeleton, Text, Box, Pagination, Center, Group } from '@mantine/core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import classes from './TaskBoard.module.css';
import type { Task } from '@medplum/fhirtypes';
import { createReference, getReferenceString } from '@medplum/core';
import type { ProfileResource } from '@medplum/core';
import { useSearchParams } from 'react-router';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';
import { IconClipboardList, IconPlus, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { NewTaskModal } from './NewTaskModal';
import { TaskListItemExpandable } from './TaskListItemExpandable';
import { sortTasks } from './TaskSortUtils';
import { TaskFilterPanel } from './TaskFilterPanel';
import { deserializeFilters, serializeFilters, DEFAULT_FILTERS } from './TaskFilterUtils';
import type { FilterState } from './TaskFilterUtils';

interface TaskBoardProps {
  query: string;
  selectedTaskId: string | undefined;
  onTaskChange: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

const ITEMS_PER_PAGE = 50;
const SIDEBAR_WIDTH_EXPANDED = 350;
const SIDEBAR_WIDTH_COLLAPSED = 60;
const SIDEBAR_MIN_WIDTH_EXPANDED = 200;

export function TaskBoard(props: TaskBoardProps): JSX.Element {
  const { query, selectedTaskId, onTaskChange, onDeleteTask } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [_selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const profileRef = useMemo(() => (profile ? createReference(profile as ProfileResource) : undefined), [profile]);
  const [newTaskModalOpened, setNewTaskModalOpened] = useState<boolean>(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | undefined>(selectedTaskId);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortedTasks, setSortedTasks] = useState<Task[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Initialize filters from URL on mount, then manage state locally
  const [filters, setFilters] = useState<FilterState>(() => {
    // First load: get filters from URL
    const urlFilters = deserializeFilters(searchParams);
    // If URL is empty, return defaults
    return Object.keys(Object.fromEntries(searchParams)).length === 0 ? DEFAULT_FILTERS : urlFilters;
  });

  const fetchTasks = useCallback(async (): Promise<void> => {
    const taskSearchParams = new URLSearchParams(query);

    // Apply owner filter (My Tasks)
    if (profileRef && filters.showMyTasks) {
      taskSearchParams.append('owner', getReferenceString(profileRef));
    }

    // Apply owners filter (multi-select) - use comma-separated for OR logic
    if (filters.owners && filters.owners.length > 0) {
      const ownerRefs = filters.owners.map(o => o.reference).filter(Boolean).join(',');
      if (ownerRefs) {
        taskSearchParams.append('owner', ownerRefs);
      }
    }

    // Apply status filter (old single select for backwards compat)
    if (filters.status) {
      taskSearchParams.append('status', filters.status);
    }

    // Apply statuses filter (multi-select) - use comma-separated for OR logic
    if (filters.statuses && filters.statuses.length > 0) {
      taskSearchParams.append('status', filters.statuses.join(','));
    }

    // Apply priorities filter - use comma-separated for OR logic
    if (filters.priorities && filters.priorities.length > 0) {
      const prioritiesStr = filters.priorities.filter(p => p).join(',');
      if (prioritiesStr) {
        taskSearchParams.append('priority', prioritiesStr);
      }
    }

    // Apply patient filter
    if (filters.patient?.reference) {
      taskSearchParams.append('patient', filters.patient.reference);
    }

    // Apply date filters
    if (filters.createdDateRange?.start) {
      taskSearchParams.append('authored-on', `ge${filters.createdDateRange.start}`);
    }
    if (filters.createdDateRange?.end) {
      taskSearchParams.append('authored-on', `le${filters.createdDateRange.end}`);
    }
    if (filters.dueDateRange?.start) {
      taskSearchParams.append('period', `ge${filters.dueDateRange.start}`);
    }
    if (filters.dueDateRange?.end) {
      taskSearchParams.append('period', `le${filters.dueDateRange.end}`);
    }

    const results: Task[] = await medplum.searchResources('Task', taskSearchParams, { cache: 'no-cache' });
    setTasks(results);
  }, [medplum, profileRef, filters, query]);

  useEffect(() => {
    setLoading(true);
    fetchTasks()
      .catch(showErrorNotification)
      .finally(() => setLoading(false));
  }, [medplum, profileRef, filters, query, fetchTasks]);

  // Sort and paginate tasks whenever tasks change
  useEffect(() => {
    const sorted = sortTasks(tasks);
    setSortedTasks(sorted);
    // Reset to page 1 when tasks change
    setCurrentPage(1);
  }, [tasks]);

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
  }, [selectedTaskId, tasks, medplum]);

  const handleNewTaskCreated = (task: Task): void => {
    fetchTasks().catch(showErrorNotification);
    handleTaskChange(task).catch(showErrorNotification);
  };

  const handleTaskChange = async (task: Task): Promise<void> => {
    setTasks(tasks.map((t) => (t.id === task.id ? task : t)));
    onTaskChange(task);
    setSelectedTask(task);
  };

  const _handleDeleteTask = async (task: Task): Promise<void> => {
    setTasks(tasks.filter((t) => t.id !== task.id));
    onDeleteTask(task);
  };

  const handleTaskToggle = (taskId: string): void => {
    setExpandedTaskId(expandedTaskId === taskId ? undefined : taskId);
  };

  const handleFilterChange = (newFilters: FilterState): void => {
    setFilters(newFilters);
    // Update URL with new filters
    const newParams = serializeFilters(newFilters);
    setSearchParams(newParams, { replace: true });
  };

  // Sync URL to filters when navigating back/forward
  useEffect(() => {
    const urlFilters = deserializeFilters(searchParams);
    // Only update if different to avoid infinite loops
    if (JSON.stringify(urlFilters) !== JSON.stringify(filters)) {
      setFilters(urlFilters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // Only depend on searchParams, not filters to avoid infinite loop

  // Calculate pagination
  const totalPages = Math.ceil(sortedTasks.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedTasks = sortedTasks.slice(startIndex, endIndex);

  return (
    <Box w="100%" h="100%">
      <Flex h="100%">
        {/* Filter Sidebar */}
        <Box
          w={sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED}
          h="100%"
          className={classes.sidebar}
          style={{
            minWidth: sidebarCollapsed ? `${SIDEBAR_WIDTH_COLLAPSED}px` : `${SIDEBAR_MIN_WIDTH_EXPANDED}px`,
          }}
        >
          <Flex direction="column" h="100%" className={classes.borderRight}>
            <Paper>
              <Flex h={64} align="center" justify="space-between" p="md">
                {!sidebarCollapsed && <Text size="lg" fw={600}>Filters</Text>}
                <Group gap="xs" style={{ marginLeft: sidebarCollapsed ? 0 : 'auto' }}>
                  {!sidebarCollapsed && (
                    <ActionIcon radius="50%" variant="filled" color="blue" onClick={() => setNewTaskModalOpened(true)}>
                      <IconPlus size={16} />
                    </ActionIcon>
                  )}
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    {sidebarCollapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
                  </ActionIcon>
                </Group>
              </Flex>
            </Paper>

            <Divider />
            {!sidebarCollapsed && (
              <Paper style={{ flex: 1, overflow: 'hidden' }}>
                <ScrollArea h="100%">
                  <TaskFilterPanel filters={filters} onFilterChange={handleFilterChange} />
                </ScrollArea>
              </Paper>
            )}
          </Flex>
        </Box>

        {/* Task List Area - Updated to use expandable list with sorting and pagination */}
        <Box style={{ flex: 1, height: '100%' }}>
          <Paper h="100%" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Task List */}
            <ScrollArea style={{ flex: 1 }}>
              {loading && <TaskListSkeleton />}
              {!loading && sortedTasks.length === 0 && <EmptyTasksState />}
              {!loading && paginatedTasks.length > 0 && (
                <Box>
                  {/* Results summary */}
                  <Box p="md" bg="gray.0">
                    <Text size="sm" c="dimmed">
                      Showing {startIndex + 1}-{Math.min(endIndex, sortedTasks.length)} of {sortedTasks.length} tasks
                    </Text>
                  </Box>

                  {paginatedTasks.map((task) => (
                    <TaskListItemExpandable
                      key={task.id}
                      task={task}
                      isExpanded={expandedTaskId === task.id}
                      onToggle={() => task.id && handleTaskToggle(task.id)}
                      onTaskChange={handleTaskChange}
                    />
                  ))}
                </Box>
              )}
            </ScrollArea>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                <Center>
                  <Pagination
                    total={totalPages}
                    value={currentPage}
                    onChange={setCurrentPage}
                    size="sm"
                  />
                </Center>
              </Box>
            )}
          </Paper>
        </Box>
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
