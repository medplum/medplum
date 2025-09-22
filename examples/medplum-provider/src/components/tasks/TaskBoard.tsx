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
  SegmentedControl,
} from '@mantine/core';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import cx from 'clsx';
import classes from './TaskBoard.module.css';
import { CodeableConcept, ResourceType, Task } from '@medplum/fhirtypes';
import { createReference, getReferenceString, MedplumClient, ProfileResource } from '@medplum/core';
import { useNavigate } from 'react-router';
import { PatientSummary, ResourceTimeline, useMedplum, useMedplumProfile, useResource } from '@medplum/react';
import { showErrorNotification } from '../../utils/notifications';
import { TaskFilterType, TaskFilterValue } from './TaskFilterMenu.utils';
import { TaskFilterMenu } from './TaskFilterMenu';
import { IconClipboardList, IconPlus } from '@tabler/icons-react';
import { TaskListItem } from './TaskListItem';
import { TaskSelectEmpty } from './TaskSelectEmpty';
import { TasksInputNote } from './TaskInputNote';
import { TaskProperties } from './TaskProperties';

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
}

export function TaskBoard(props: TaskBoardProps): JSX.Element {
  const { query, selectedTaskId, onTaskChange, onDeleteTask } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const profileRef = useMemo(() => (profile ? createReference(profile as ProfileResource) : undefined), [profile]);
  const [performerTypes, setPerformerTypes] = useState<CodeableConcept[]>([]);
  const selectedPatient = useResource(selectedTask?.for);
  const [activeTab, setActiveTab] = useState<string>('properties');

  const [filters, setFilters] = useState<FilterState>({
    showMyTasks: true,
    status: undefined,
    performerType: undefined,
  });

  useEffect(() => {
    const fetchTasks = async (): Promise<void> => {
      const searchParams = new URLSearchParams(query);

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
  }, [medplum, profileRef, filters, query]);

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

  const handleTaskChange = (task: Task): void => {
    setTasks(tasks.map((t) => (t.id === task.id ? task : t)));
    onTaskChange(task);
  };

  const handleDeleteTask = (task: Task): void => {
    setTasks(tasks.filter((t) => t.id !== task.id));
    onDeleteTask(task);
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

  const handleTabChange = (value: string): void => {
    setActiveTab(value);
  };

  const handleShowMyTasksChange = (flag: boolean): void => {
    setFilters({
      showMyTasks: flag,
      status: undefined,
      performerType: undefined,
    });
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

                <ActionIcon radius="50%" variant="filled" color="blue" onClick={() => navigate('/Task/new')}>
                  <IconPlus size={16} />
                </ActionIcon>
              </Flex>
            </Paper>

            <Divider />

            {/* Task List */}
            <Paper style={{ flex: 1, overflow: 'hidden' }}>
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
        </Box>

        {selectedTask ? (
          <>
            <Box
              h="100%"
              style={{
                flex: 1,
              }}
              className={classes.borderRight}
            >
              {selectedTask && (
                <TasksInputNote task={selectedTask} onTaskChange={handleTaskChange} onDeleteTask={handleDeleteTask} />
              )}
            </Box>

            {/* Yellow Column - 450px width */}
            {selectedTask && selectedPatient?.resourceType === 'Patient' && (
              <Box h="100%" w="400px">
                <Paper h="100%" style={{ overflow: 'hidden' }}>
                  <Box px="md" pb="md" pt="md">
                    <SegmentedControl
                      value={activeTab}
                      onChange={(value: string) => handleTabChange(value)}
                      data={[
                        { label: 'Properties', value: 'properties' },
                        { label: 'Activity Log', value: 'activity-log' },
                        { label: 'Patient Summary', value: 'patient-summary' },
                      ]}
                      fullWidth
                      radius="md"
                      color="gray"
                      size="sm"
                      className={classes.segmentedControl}
                    />
                  </Box>

                  <Box>
                    {selectedTask && selectedPatient?.resourceType === 'Patient' && (
                      <>
                        {activeTab === 'properties' && (
                          <ScrollArea h="calc(100vh - 120px)">
                            <TaskProperties
                              key={selectedTask.id}
                              p="md"
                              task={selectedTask}
                              onTaskChange={onTaskChange}
                            />
                          </ScrollArea>
                        )}
                        {activeTab === 'activity-log' && (
                          <ScrollArea h="calc(100vh - 120px)">
                            <ResourceTimeline
                              value={selectedTask}
                              loadTimelineResources={async (
                                medplum: MedplumClient,
                                _resourceType: ResourceType,
                                id: string
                              ) => {
                                return Promise.allSettled([medplum.readHistory('Task', id)]);
                              }}
                            />
                          </ScrollArea>
                        )}
                        {activeTab === 'patient-summary' && selectedPatient && (
                          <ScrollArea h="calc(100vh - 120px)">
                            <PatientSummary patient={selectedPatient} />
                          </ScrollArea>
                        )}
                      </>
                    )}
                  </Box>
                </Paper>
              </Box>
            )}
          </>
        ) : (
          <Flex direction="column" h="100%" style={{ flex: 1 }}>
            <TaskSelectEmpty />
          </Flex>
        )}
      </Flex>
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
