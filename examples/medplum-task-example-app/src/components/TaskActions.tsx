import { Button, Paper, Stack, Title } from '@mantine/core';
import { Annotation, Coding, Reference, Resource, Task } from '@medplum/fhirtypes';
import { Loading, useMedplum, useResource } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddDueDateModal } from './AddDueDateModal';
import { AddTaskComment } from './AddTaskComment';
import { AssignTaskModal } from './AssignTaskModal';
import { ClaimTaskModal } from './ClaimTaskModal';
import { DeleteTaskModal } from './DeleteTaskModal';
import {
  handleAddComment,
  handleAddDueDate,
  handleAssignTask,
  handleClaimTask,
  handleDeleteTask,
  handleUpdateStatus,
} from './TaskActions.handlers';
import { UpdateStatusModal } from './UpdateStatusModal';

interface TaskActionsProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function TaskActions(props: TaskActionsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const task = useResource(props.task);
  const [isCommentOpen, setIsCommentOpen] = useState<boolean>(false);
  const [isDueDateOpen, setIsDueDateOpen] = useState<boolean>(false);
  const [isAssignOpen, setIsAssignOpen] = useState<boolean>(false);
  const [isStatusOpen, setIsStatusOpen] = useState<boolean>(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);
  const [isClaimOpen, setIsClaimOpen] = useState<boolean>(false);

  const handleCommentModal = () => {
    setIsCommentOpen(!isCommentOpen);
  };

  const handleDueDateModal = () => {
    setIsDueDateOpen(!isDueDateOpen);
  };

  const handleAssignModal = () => {
    setIsAssignOpen(!isAssignOpen);
  };

  const handleStatusModal = () => {
    setIsStatusOpen(!isStatusOpen);
  };

  const handleDeleteModal = () => {
    setIsDeleteOpen(!isDeleteOpen);
  };

  const handleClaimModal = () => {
    setIsClaimOpen(!isClaimOpen);
  };

  const handleChangeTaskStatus = async () => {
    if (task) {
      const updatedTask: Task = { ...task };
      if (updatedTask.status !== 'on-hold') {
        updatedTask.status = 'on-hold';
      } else {
        updatedTask.status = 'in-progress';
      }
      await medplum.updateResource(updatedTask);
      props.onChange(updatedTask);
    } else {
      throw new Error('No valid task to update');
    }
  };

  const handleCompleteTask = async () => {
    if (task) {
      const updatedTask: Task = { ...task };
      updatedTask.status = 'completed';

      await medplum.updateResource(updatedTask);
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
        <Button onClick={handleCommentModal}>Add a Comment</Button>
        <Button onClick={handleDueDateModal}>Add Due Date</Button>
        <Button onClick={handleStatusModal}>Update Status</Button>
        <Button onClick={handleAssignModal}>{task.owner ? 'Reassign Task' : 'Assign Task'}</Button>
        {!task.owner ? <Button onClick={handleClaimModal}>Claim Task</Button> : null}
        {task.status === 'on-hold' ? (
          <Button onClick={handleChangeTaskStatus}>Resume Task</Button>
        ) : (
          <Button onClick={handleChangeTaskStatus}>Pause Task</Button>
        )}
        {task.status === 'completed' ? null : <Button onClick={handleCompleteTask}>Complete Task</Button>}
        <Button onClick={handleDeleteModal} color="red">
          Delete Task
        </Button>
      </Stack>
      <Paper>
        <AddTaskComment
          onAddComment={(comment: Annotation) => handleAddComment(comment, task, medplum, props.onChange)}
          isOpen={isCommentOpen}
          onClose={handleCommentModal}
        />
        <AddDueDateModal
          onAddDate={(date: string) => handleAddDueDate(date, task, medplum, props.onChange)}
          isOpen={isDueDateOpen}
          onClose={handleDueDateModal}
        />
        <AssignTaskModal
          onAssign={(owner: Reference<Resource>) => handleAssignTask(owner, task, medplum, props.onChange)}
          isOpen={isAssignOpen}
          onClose={handleAssignModal}
        />
        <UpdateStatusModal
          onUpdateStatus={(status: Coding) => handleUpdateStatus(status, task, medplum, props.onChange)}
          isOpen={isStatusOpen}
          onClose={handleStatusModal}
        />
        <ClaimTaskModal
          onClaimTask={() => handleClaimTask(task, medplum, props.onChange)}
          opened={isClaimOpen}
          onClose={handleClaimModal}
        />
        <DeleteTaskModal
          onDelete={() => handleDeleteTask(task, medplum, navigate)}
          opened={isDeleteOpen}
          onClose={handleDeleteModal}
        />
      </Paper>
    </Stack>
  );
}
