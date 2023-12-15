import { Button, Group, Modal, Text } from '@mantine/core';

interface ClaimTaskModalProps {
  opened: boolean;
  onClose: () => void;
  onClaimTask: () => void;
}

export function ClaimTaskModal({ opened, onClose, onClaimTask }: ClaimTaskModalProps): JSX.Element {
  return (
    <Modal opened={opened} onClose={onClose}>
      <Text fw={700}>Are you sure you want to assign this task to yourself?</Text>
      <Group>
        <Button onClick={onClaimTask}>Assign to Me</Button>
        <Button variant="outline">Cancel</Button>
      </Group>
    </Modal>
  );
}
