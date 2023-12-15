import { notifications } from '@mantine/notifications';
import { MedplumClient } from '@medplum/core';
import { Annotation, Coding, Practitioner, Reference, Resource, Task } from '@medplum/fhirtypes';
import { NavigateFunction } from 'react-router-dom';

type OwnerTypes = Task['owner'];

export async function handleAddComment(
  comment: Annotation,
  task: Task,
  medplum: MedplumClient,
  onChange: (task: Task) => void
): Promise<void> {
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
  await medplum.updateResource(updatedTask).catch((error) =>
    notifications.show({
      title: 'Error',
      message: `Error: ${error}`,
    })
  );
  notifications.show({
    title: 'Success',
    message: 'Comment added',
  });
  onChange(updatedTask);
}

export async function handleAddDueDate(
  date: string,
  task: Task,
  medplum: MedplumClient,
  onChange: (task: Task) => void
): Promise<void> {
  const updatedTask: Task = { ...task, resourceType: 'Task' };

  // If there is no defined period for a task, add one
  updatedTask.restriction = updatedTask.restriction ?? {};
  updatedTask.restriction.period = updatedTask.restriction.period ?? {};

  // Set the period end date to your due date. For more details see https://www.medplum.com/docs/careplans/tasks#task-start--due-dates
  updatedTask.restriction.period.end = date;

  // Update the task with the new due date
  await medplum.updateResource(updatedTask).catch((error) =>
    notifications.show({
      title: 'Error',
      message: `Error: ${error}`,
    })
  );
  notifications.show({
    title: 'Success',
    message: 'The due-date has been updated.',
  });
  onChange(updatedTask);
}

export async function handleUpdateStatus(
  status: Coding,
  task: Task,
  medplum: MedplumClient,
  onChange: (task: Task) => void
): Promise<void> {
  if (!task) {
    return;
  }

  // Create a resource for an updated Task
  const updatedTask: Task = { ...task };

  // Update the status of your Task. For more details see https://www.medplum.com/docs/careplans/tasks#task-status
  updatedTask.businessStatus = { coding: [status] };

  // Update the Task on the server and re-render.
  await medplum.updateResource(updatedTask).catch((error) =>
    notifications.show({
      title: 'Error',
      message: `Error: ${error}`,
    })
  );
  notifications.show({
    title: 'Success',
    message: 'Status updated.',
  });
  onChange(updatedTask);
}

export async function handleAssignTask(
  owner: Reference,
  task: Task,
  medplum: MedplumClient,
  onChange: (task: Task) => void
): Promise<void> {
  if (!task) {
    return;
  }

  // Create a resource for the updated task
  const updatedTask = { ...task };

  // Update the owner, or who is responsible for the task. For more details see https://www.medplum.com/docs/careplans/tasks#task-assignment
  updatedTask.owner = owner as OwnerTypes;

  await medplum.updateResource(updatedTask).catch((error) =>
    notifications.show({
      title: 'Error',
      message: `Error: ${error}`,
    })
  );
  notifications.show({
    title: 'Success',
    message: 'Task assigned.',
  });
  onChange(updatedTask);
}

export async function handleClaimTask(
  task: Task,
  medplum: MedplumClient,
  onChange: (task: Task) => void
): Promise<void> {
  const currentUser = medplum.getProfile() as Practitioner;

  if (!task) {
    return;
  }

  // Create a resource for the updated task.
  const updatedTask = { ...task };

  // Update the owner to the current user. For more details see https://www.medplum.com/docs/careplans/tasks#task-assignment
  updatedTask.owner = {
    reference: `Practitioner/${currentUser.id}`,
    resource: currentUser,
  };

  await medplum.updateResource(updatedTask).catch((error) =>
    notifications.show({
      title: 'Error',
      message: `Error: ${error}`,
    })
  );
  notifications.show({
    title: 'Success',
    message: 'You have claimed this task.',
  });
  onChange(updatedTask);
}

export async function handleDeleteTask(task: Task, medplum: MedplumClient, navigate: NavigateFunction): Promise<void> {
  // Get the task id
  const taskId = task.id;

  if (taskId) {
    // Delete the task and navigate to the main tasks queue
    await medplum.deleteResource('Task', taskId).catch((error) =>
      notifications.show({
        title: 'Error',
        message: `Error: ${error}`,
      })
    );
    navigate('/Task');
    notifications.show({
      title: 'Deleted',
      message: 'This task has been deleted.',
    });
  } else {
    console.error('Task could not be deleted');
  }
}
