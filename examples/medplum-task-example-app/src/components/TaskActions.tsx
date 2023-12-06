import { Button, Input } from '@mantine/core';
import { Annotation, Reference, Task } from '@medplum/fhirtypes';
import { AnnotationInput, Form, FormSection, Loading, useMedplum, useResource } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AddTaskComment } from './AddTaskComment';

interface TaskActionsProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function TaskActions(props: TaskActionsProps): JSX.Element {
  const medplum = useMedplum();
  const task = useResource(props.task);

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

  if (!task) {
    return <Loading />;
  }

  return (
    <div>
      <FormSection>
        <Button>Assign Task</Button>
      </FormSection>
      <FormSection>
        <Button>Add Due Date</Button>
      </FormSection>
      <FormSection>
        <AddTaskComment task={task} onAddComment={handleAddComment} />
      </FormSection>
      <FormSection>
        <Button>Update Status</Button>
      </FormSection>
      <FormSection>
        <Button>Delete Task</Button>
      </FormSection>
    </div>
  );
}
