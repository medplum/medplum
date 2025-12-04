// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Task } from '@medplum/fhirtypes';
import React from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import classes from '../tasks/TasksPage.module.css';
import { TaskBoard } from '../../components/tasks/TaskBoard';

export function TasksTab(): JSX.Element {
  const { patientId, taskId } = useParams();
  const navigate = useNavigate();

  const onSelectedItem = (task: Task): string => {
    return `/Patient/${patientId}/Task/${task.id}`;
  };

  const handleTaskChange = (task: Task): void => {
    navigate(onSelectedItem(task))?.catch(console.error);
  };

  const handleDeleteTask = (_: Task): void => {
    navigate(`/Patient/${patientId}/Task`)?.catch(console.error);
  };

  return (
    <div className={classes.container}>
      <TaskBoard
        query={`patient=Patient/${patientId}&_sort=-_lastUpdated`}
        selectedTaskId={taskId}
        onTaskChange={handleTaskChange}
        onDeleteTask={handleDeleteTask}
        onSelectedItem={onSelectedItem}
      />
    </div>
  );
}
