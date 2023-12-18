import { Alert, Button, Group, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { MedplumClient, normalizeErrorString } from '@medplum/core';
import { Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertCircle, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';
import { NavigateFunction, useNavigate } from 'react-router-dom';

interface DeleteTaskProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function DeleteTask(props: DeleteTaskProps): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const medplum = useMedplum();
  const navigate = useNavigate();

  const handleOpenClose = (): void => {
    setIsModalOpen(!isModalOpen);
  };

  const handleDelete = async (task: Task, medplum: MedplumClient, navigate: NavigateFunction): Promise<void> => {
    // Get the task id
    const taskId = task.id;

    if (!taskId) {
      return;
    }
    try {
      // Delete the task and navigate back to the main page
      await medplum.deleteResource('Task', taskId);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task deleted',
      });
      navigate('/Task');
    } catch (error) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }
  };

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose} color="red">
        Delete Task
      </Button>
      <Modal opened={isModalOpen} onClose={handleOpenClose} withCloseButton={false}>
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
