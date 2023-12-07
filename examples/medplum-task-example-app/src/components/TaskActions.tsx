import { Button, Stack } from '@mantine/core';
import { Annotation, Task } from '@medplum/fhirtypes';
import { DateTimeInput, Document, FormSection, Loading, useMedplum, useResource } from '@medplum/react';
import { useState } from 'react';
import { AddDueDateModal } from './AddDueDateModal';
import { AddTaskComment } from './AddTaskComment';
import { AssignTaskModal } from './AssignTaskModal';
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

  const handleAddComment = (comment: Annotation) => {
    let taskNotes = task?.note;
    if (taskNotes) {
      // If there are already notes, push on to the array
      taskNotes.push(comment);
    } else {
      // Otherwise, create an array with the first comment
      taskNotes = [comment];
    }

    if (!task) {
      return;
    }

    // Create an updated task with the new note. See https://www.medplum.com/docs/careplans/tasks#task-comments
    const updatedTask = {
      ...task,
      note: taskNotes,
    };

    // Update the resource on the server and re-render the task page
    medplum.updateResource(updatedTask);
    props.onChange(updatedTask);
  };

  const handleAddDueDate = (date: string) => {
    const updatedTask: Task = { ...task, resourceType: 'Task' };

    updatedTask.restriction = updatedTask.restriction ?? {};
    updatedTask.restriction.period = updatedTask.restriction.period ?? {};
    updatedTask.restriction.period.end = date;

    medplum.updateResource(updatedTask);
    props.onChange(updatedTask);
  };

  if (!task) {
    return <Loading />;
  }

  return (
    <Document>
      <Stack>
        <div className="comment">
          <Button onClick={handleCommentModal}>Add a Comment</Button>
          <AddTaskComment
            task={task}
            onAddComment={handleAddComment}
            isOpen={isCommentOpen}
            onClose={handleCommentModal}
          />
        </div>
        <div>
          <AddDueDateModal
            task={task}
            onAddDate={handleAddDueDate}
            isOpen={isDueDateOpen}
            onClose={handleDueDateModal}
          />
          <Button onClick={handleDueDateModal}>Add Due Date</Button>
        </div>
        <div>
          <AssignTaskModal isOpen={isAssignOpen} onClose={handleAssignModal} />
          <Button onClick={handleAssignModal}>Assign Task</Button>
        </div>
        <div>
          <UpdateStatusModal isOpen={isStatusOpen} onClose={handleStatusModal} />
          <Button onClick={handleStatusModal}>Update Status</Button>
        </div>
        <div>
          <Button>Delete Task</Button>
        </div>
      </Stack>
    </Document>
  );
}
