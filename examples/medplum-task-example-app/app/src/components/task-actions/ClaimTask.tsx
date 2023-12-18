import { Button, Group, Modal, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { MedplumClient } from '@medplum/core';
import { Practitioner, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';

interface ClaimTaskProps {
  task: Task;
  onChange: (updatedTask: Task) => void;
}

export function ClaimTask(props: ClaimTaskProps): JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const medplum = useMedplum();

  const handleOpenClose = (): void => {
    setIsOpen(!isOpen);
  };

  const handleClaimTask = async (task: Task, medplum: MedplumClient, onChange: (task: Task) => void): Promise<void> => {
    const currentUser = medplum.getProfile() as Practitioner;

    if (!task) {
      return;
    }

    // Create a resource for the updated task.
    const updatedTask = { ...task };

    // Update the owner to the current user. For more details see https://www.medplum.com/docs/careplans/tasks#task-assignment
    updatedTask.owner = {
      reference: `Practitioner/${currentUser.id}`,
      // resource: currentUser,
    };

    await medplum
      .updateResource(updatedTask)
      .then(() =>
        notifications.show({
          title: 'Success',
          message: 'You have claimed this task.',
        })
      )
      .catch((error) =>
        notifications.show({
          title: 'Error',
          message: `Error: ${error}`,
        })
      );
    onChange(updatedTask);
    handleOpenClose();
  };

  return (
    <div>
      <Button fullWidth onClick={handleOpenClose}>
        Claim Task
      </Button>
      <Modal opened={isOpen} onClose={handleOpenClose}>
        <Text fw={700}>Are you sure you want to assign this task to yourself?</Text>
        <Group>
          <Button onClick={() => handleClaimTask(props.task, medplum, props.onChange)}>Assign to Me</Button>
          <Button variant="outline">Cancel</Button>
        </Group>
      </Modal>
    </div>
  );
}
