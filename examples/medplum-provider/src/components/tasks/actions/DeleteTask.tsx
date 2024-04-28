import { Alert, Button, Group, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { MedplumClient, normalizeErrorString } from '@medplum/core';
import { Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertCircle, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { NavigateFunction, useNavigate } from 'react-router-dom';

interface DeleteTaskProps {
  readonly task: Task;
  readonly onChange: (updatedTask: Task) => void;
}

export function DeleteTask(props: DeleteTaskProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure(false);

  const handleDelete = async (task: Task, medplum: MedplumClient, navigate: NavigateFunction): Promise<void> => {
    // Get the task id
    const taskId = task.id as string;

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
      <Button fullWidth onClick={toggle} color="red">
        Delete Task
      </Button>
      <Modal opened={opened} onClose={close} withCloseButton={false}>
        <Alert color="red" title="Warning" icon={<IconAlertCircle />}>
          Are you sure you want to delete this task?
          <Group>
            <Button onClick={() => handleDelete(props.task, medplum, navigate)} color="red">
              Yes, Delete
            </Button>
            <Button onClick={close} color="red" variant="outline">
              Cancel
            </Button>
          </Group>
        </Alert>
      </Modal>
    </div>
  );
}
