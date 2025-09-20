// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Task } from '@medplum/fhirtypes';
import React, { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import classes from './TasksPage.module.css';
import { TaskBoard } from '../../components/tasks/TaskBoard';

export function TasksPage(): JSX.Element {
  const { taskId } = useParams();
  const navigate = useNavigate();

  const handleTaskChange = (task: Task): void => {
    navigate(`/Task/${task.id}`)?.catch(console.error);
  };

  const handleDeleteTask = (_: Task): void => {
    navigate(`/Task`)?.catch(console.error);
  };

  return (
    <div className={classes.container}>
      <TaskBoard
        query="_sort=-_lastUpdated"
        selectedTaskId={taskId}
        onTaskChange={handleTaskChange}
        onDeleteTask={handleDeleteTask}
      />
    </div>
  );
}
