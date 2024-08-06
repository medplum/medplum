import { Button, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { createReference, normalizeErrorString, PatchOperation } from '@medplum/core';
import { Practitioner, Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface ClaimTaskProps {
  readonly task: Task;
  readonly onChange: (updatedTask: Task) => void;
}

export function ClaimTask(props: ClaimTaskProps): JSX.Element {
  const medplum = useMedplum();
  const currentUser = useMedplumProfile() as Practitioner;
  const [opened, { open, close }] = useDisclosure(false);

  const handleClaimTask = async (task: Task, onChange: (task: Task) => void): Promise<void> => {
    const taskId = task.id as string;

    // Create a patch operation to update the owner to the current user. For more details on task assignment, see https://www.medplum.com/docs/careplans/tasks#task-assignment
    // We use a patch operation here to avoid race conditions. This ensures that if multiple users try to claim the task simultaneously, only one will be successful.
    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: task.meta?.versionId },
      { op: 'add', path: '/owner', value: createReference(currentUser) },
    ];

    // Patch the task with the current user as the new owner
    try {
      const result = await medplum.patchResource('Task', taskId, ops);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Task claimed',
      });
      onChange(result);
    } catch (error) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }

    close();
  };

  return (
    <div>
      <Button fullWidth onClick={open}>
        Claim Task
      </Button>
      <Modal opened={opened} onClose={close}>
        <Text fw={500} size="lg">
          Assign this task to yourself?
        </Text>
        <Group justify="flex-end" mt="xl" gap="xs">
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => handleClaimTask(props.task, props.onChange)}>Claim</Button>
        </Group>
      </Modal>
    </div>
  );
}
