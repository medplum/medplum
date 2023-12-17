import { Button, Stack, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CodeableConcept, Task } from '@medplum/fhirtypes';
import { Loading, useMedplum, useResource } from '@medplum/react';
import { AddComment } from './task-actions/AddComment';
import { AddDueDate } from './task-actions/AddDueDate';
import { UpdateStatus } from './task-actions/UpdateStatus';
import { AssignTask } from './task-actions/AssignTask';
import { AssignRole } from './task-actions/AssignRole';
import { ClaimTask } from './task-actions/ClaimTask';
import { DeleteTask } from './task-actions/DeleteTask';

interface TaskActionsProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function TaskActions(props: TaskActionsProps): JSX.Element {
  const medplum = useMedplum();
  const task = useResource(props.task);

  const handleChangeTaskStatus = async (): Promise<void> => {
    if (task) {
      const updatedTask: Task = { ...task };
      if (updatedTask.status !== 'on-hold') {
        updatedTask.status = 'on-hold';
        await medplum.updateResource(updatedTask);
        notifications.show({
          title: 'Success',
          message: 'Task paused',
        });
        props.onChange(updatedTask);
      } else {
        updatedTask.status = 'in-progress';
        await medplum.updateResource(updatedTask);
        notifications.show({
          title: 'Success',
          message: 'Task resumed',
        });
      }
    } else {
      notifications.show({
        title: 'Error',
        message: 'No valid task to update.',
      });
      throw new Error('No valid task to update');
    }
  };

  const handleCompleteTask = async (): Promise<void> => {
    if (task) {
      const updatedTask: Task = { ...task };
      updatedTask.status = 'completed';

      await medplum.updateResource(updatedTask);
      notifications.show({
        title: 'Success',
        message: 'Task completed!',
      });
      props.onChange(updatedTask);
    }
  };

  if (!task) {
    return <Loading />;
  }

  return (
    <Stack>
      <Title>Task Actions</Title>
      <Stack>
        <AddComment task={task} onChange={() => props.onChange(task)} />
        <AddDueDate task={task} onChange={() => props.onChange(task)} />
        <UpdateStatus task={task} onChange={() => props.onChange(task)} />
        <AssignTask task={task} onChange={() => props.onChange(task)} />
        <AssignRole task={task} onChange={() => props.onChange(task)} />
        <ClaimTask task={task} onChange={() => props.onChange(task)} />
        {task.status === 'on-hold' ? (
          <Button onClick={handleChangeTaskStatus}>Resume Task</Button>
        ) : (
          <Button onClick={handleChangeTaskStatus}>Pause Task</Button>
        )}
        {task.status === 'completed' ? null : <Button onClick={handleCompleteTask}>Complete Task</Button>}
        <DeleteTask task={task} onChange={() => props.onChange(task)} />
      </Stack>
    </Stack>
  );
}
