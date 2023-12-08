import { getReferenceString, MedplumClient } from '@medplum/core';
import { Annotation, Coding, Practitioner, Reference, Resource, Task } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react';
import { NavigateFunction } from 'react-router-dom';

type OwnerTypes = Task['owner'];

type TaskStatus = Task['status'];

export function handleAddComment(
  comment: Annotation,
  task: Task,
  medplum: MedplumClient,
  onChange: (task: Task) => void
) {
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
  onChange(updatedTask);
}

export function handleAddDueDate(date: string, task: Task, medplum: MedplumClient, onChange: (task: Task) => void) {
  const updatedTask: Task = { ...task, resourceType: 'Task' };

  // If there is no defined period for a task, add one
  updatedTask.restriction = updatedTask.restriction ?? {};
  updatedTask.restriction.period = updatedTask.restriction.period ?? {};

  // Set the period end date to your due date. For more details see https://www.medplum.com/docs/careplans/tasks#task-start--due-dates
  updatedTask.restriction.period.end = date;

  // Update the task with the new due date
  medplum.updateResource(updatedTask);
  onChange(updatedTask);
}

export function handleUpdateStatus(status: Coding, task: Task, medplum: MedplumClient, onChange: (task: Task) => void) {
  if (!task) return;

  // Create a resource for an updated Task
  const updatedTask: Task = { ...task };

  // Update the status of your Task
  updatedTask.status = status.display as TaskStatus;

  // Update the Task on the server and re-render. For more details see https://www.medplum.com/docs/careplans/tasks#task-status
  medplum.updateResource(updatedTask);
  onChange(updatedTask);
}

export function handleAssignTask(
  owner: Reference<Resource>,
  task: Task,
  medplum: MedplumClient,
  onChange: (task: Task) => void
) {
  if (!task) return;

  const updatedTask = { ...task };

  updatedTask.owner = owner as OwnerTypes;

  medplum.updateResource(updatedTask);
  onChange(updatedTask);
}

export async function handleClaimTask(task: Task, medplum: MedplumClient, onChange: (task: Task) => void) {
  const currentUser = medplum.getProfile() as Practitioner;

  if (!task) return;

  const updatedTask = { ...task };

  updatedTask.owner = {
    reference: `Practitioner/${currentUser.id}`,
    resource: currentUser,
  };

  medplum.updateResource(updatedTask);
  onChange(updatedTask);
}

export function handleDeleteTask(task: Task, medplum: MedplumClient, navigate: NavigateFunction) {
  const taskId = task.id;

  if (taskId) {
    medplum.deleteResource('Task', taskId);
    navigate('/Task');
  } else {
    console.error('Task could not be deleted');
  }
}
