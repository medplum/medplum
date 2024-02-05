import { Stack, Title } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { Loading, useResource } from '@medplum/react';
import { AddNote } from './AddNote';
import { AddDueDate } from './AddDueDate';
import { UpdateBusinessStatus } from './UpdateBusinessStatus';
import { AssignTask } from './AssignTask';
import { AssignRole } from './AssignRole';
import { ClaimTask } from './ClaimTask';
import { DeleteTask } from './DeleteTask';
import { PauseResumeTask } from './PauseResumeTask';
import { CompleteTask } from './CompleteTask';

interface TaskActionsProps {
  readonly task: Task;
  readonly onChange: (updatedTask: Task) => void;
}

export function TaskActions(props: TaskActionsProps): JSX.Element {
  const task = useResource(props.task);

  if (!task) {
    return <Loading />;
  }

  return (
    <Stack>
      <Title>Task Actions</Title>
      <Stack>
        <AddNote task={task} onChange={props.onChange} />
        <AddDueDate task={task} onChange={props.onChange} />
        <UpdateBusinessStatus task={task} onChange={props.onChange} />
        <AssignTask task={task} onChange={props.onChange} />
        <AssignRole task={task} onChange={props.onChange} />
        {!task.owner ? <ClaimTask task={task} onChange={props.onChange} /> : null}
        <PauseResumeTask task={task} onChange={props.onChange} />
        <CompleteTask task={task} onChange={props.onChange} />
        <DeleteTask task={task} onChange={props.onChange} />
      </Stack>
    </Stack>
  );
}
