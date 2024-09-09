import { Alert, Button, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface DeleteTaskProps {
  readonly task: Task;
  readonly onDeleted: () => void;
}

export function DeleteTask(props: DeleteTaskProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, { open, close }] = useDisclosure(false);

  const handleDelete = async (task: Task): Promise<void> => {
    try {
      // Delete the task and navigate back to task list
      await medplum.deleteResource('Task', task.id as string);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task deleted',
      });
      props.onDeleted();
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
      <Button fullWidth onClick={open} color="red">
        Delete Task
      </Button>
      <Modal opened={opened} onClose={close}>
        <Alert color="red">
          <Text size="lg" fw={500} c="red">
            Are you sure you want to delete this task?
          </Text>
          <Group justify="flex-end" mt="xl" gap="xs">
            <Button onClick={close} color="red" variant="outline">
              Cancel
            </Button>
            <Button onClick={() => handleDelete(props.task)} color="red">
              Yes, delete
            </Button>
          </Group>
        </Alert>
      </Modal>
    </div>
  );
}
