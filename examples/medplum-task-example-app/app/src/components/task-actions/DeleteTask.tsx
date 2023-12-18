import { Alert, Button, Group, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { MedplumClient } from '@medplum/core';
import { Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { NavigateFunction, useNavigate } from 'react-router-dom';

interface DeleteTaskProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function DeleteTask(props: DeleteTaskProps): JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const medplum = useMedplum();
  const navigate = useNavigate();

  const handleOpenClose = (): void => {
    setIsOpen(!isOpen);
  };

  const handleDelete = async (task: Task, medplum: MedplumClient, navigate: NavigateFunction): Promise<void> => {
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
  };

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose} color="red">
        Delete Task
      </Button>
      <Modal opened={isOpen} onClose={handleOpenClose} withCloseButton={false}>
        <Alert color="red" title="Warning" icon={<IconAlertCircle />}>
          Are you sure you want to delete this task?
          <Group>
            <Button onClick={() => handleDelete(props.task, medplum, navigate)} color="red">
              Yes, Delete
            </Button>
            <Button onClick={handleOpenClose} color="red" variant="outline">
              Cancel
            </Button>
          </Group>
        </Alert>
      </Modal>
    </div>
  );
}
