// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Flex, Paper, ScrollArea, Skeleton, Stack } from '@mantine/core';
import { createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import cx from 'clsx';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import { TaskListItem } from '../../components/tasks/TaskListItem';
import { showErrorNotification } from '../../utils/notifications';
import classes from './TasksPage.module.css';

export function TasksPage(): JSX.Element {
  const { taskId } = useParams();
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
  const [showMyTasks, setShowMyTasks] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [notFound, setNotFound] = useState<boolean>(false);
  const profileRef = useMemo(() => (profile ? createReference(profile as ProfileResource) : undefined), [profile]);

  useEffect(() => {
    const fetchTasks = async (): Promise<void> => {
      const searchParams = new URLSearchParams();
      searchParams.append('_sort', '-_lastUpdated');
      if (profileRef && showMyTasks) {
        searchParams.append('owner', getReferenceString(profileRef));
      }
      const tasks = await medplum.searchResources('Task', searchParams, { cache: 'no-cache' });
      setTasks(tasks);
    };

    setLoading(true);
    fetchTasks()
      .catch(showErrorNotification)
      .finally(() => setLoading(false));
  }, [medplum, profileRef, showMyTasks]);

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

  return (
    <div className={classes.container}>
      <Flex h="100%" w="100%">
        <Flex direction="column" w="40%" h="100%" className={classes.borderRight}>
          <Paper>
            <Flex p="md" gap="xs" align="center" h={72}>
              <Button
                className={cx(classes.button, { [classes.selected]: showMyTasks })}
                h={32}
                radius="xl"
                onClick={() => setShowMyTasks(true)}
              >
                My Tasks
              </Button>

              <Button
                className={cx(classes.button, { [classes.selected]: !showMyTasks })}
                h={32}
                radius="xl"
                onClick={() => setShowMyTasks(false)}
              >
                All Tasks
              </Button>
            </Flex>
          </Paper>
          <Divider />
          <Paper h="calc(100% - 60px)" id="task-list">
            <ScrollArea h="100%" id="task-list-scrollarea">
              {loading ? (
                <TaskListSkeleton />
              ) : (
                tasks.map((task, index) => (
                  <React.Fragment key={task.id}>
                    <TaskListItem task={task} selectedTask={selectedTask} />
                    {index < tasks.length - 1 && <Divider />}
                  </React.Fragment>
                ))
              )}
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
