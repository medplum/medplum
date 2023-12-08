import { Button, Stack } from '@mantine/core';
import { Annotation, Coding, Reference, Resource, Task } from '@medplum/fhirtypes';
import { Loading, useMedplum, useResource } from '@medplum/react';
import { useState } from 'react';
import { AddDueDateModal } from './AddDueDateModal';
import { AddTaskComment } from './AddTaskComment';
import { AssignTaskModal } from './AssignTaskModal';
import { handleAddComment, handleAddDueDate, handleAssignTask, handleUpdateStatus } from './TaskActions.handlers';
import { UpdateStatusModal } from './UpdateStatusModal';

interface TaskActionsProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function TaskActions(props: TaskActionsProps): JSX.Element {
  const medplum = useMedplum();
  const task = useResource(props.task);
  const [isCommentOpen, setIsCommentOpen] = useState<boolean>(false);
  const [isDueDateOpen, setIsDueDateOpen] = useState<boolean>(false);
  const [isAssignOpen, setIsAssignOpen] = useState<boolean>(false);
  const [isStatusOpen, setIsStatusOpen] = useState<boolean>(false);

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

  if (!task) {
    return <Loading />;
  }

  return (
    <Stack>
      <div className="comment">
        <AddTaskComment
          onAddComment={(comment: Annotation) => handleAddComment(comment, task, medplum, props.onChange)}
          isOpen={isCommentOpen}
          onClose={handleCommentModal}
        />
        <Button fullWidth onClick={handleCommentModal}>
          Add a Comment
        </Button>
      </div>
      <div>
        <AddDueDateModal
          onAddDate={(date: string) => handleAddDueDate(date, task, medplum, props.onChange)}
          isOpen={isDueDateOpen}
          onClose={handleDueDateModal}
        />
        <Button fullWidth onClick={handleDueDateModal}>
          Add Due Date
        </Button>
      </div>
      <div>
        <AssignTaskModal
          onAssign={(owner: Reference<Resource>) => handleAssignTask(owner, task, medplum, props.onChange)}
          isOpen={isAssignOpen}
          onClose={handleAssignModal}
        />
        <Button fullWidth onClick={handleAssignModal}>
          Assign Task
        </Button>
      </div>
      <div>
        <UpdateStatusModal
          onUpdateStatus={(status: Coding) => handleUpdateStatus(status, task, medplum, props.onChange)}
          isOpen={isStatusOpen}
          onClose={handleStatusModal}
        />
        <Button fullWidth onClick={handleStatusModal}>
          Update Status
        </Button>
      </div>
      <div>
        <Button color="red" fullWidth>
          Delete Task
        </Button>
      </div>
    </Stack>
  );
}
