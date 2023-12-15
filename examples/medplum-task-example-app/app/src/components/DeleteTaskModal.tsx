import { Alert, Button, Group, Modal } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface DeleteTaskModalProps {
  onDelete: () => void;
  opened: boolean;
  onClose: () => void;
}

export function DeleteTaskModal(props: DeleteTaskModalProps): JSX.Element {
  return (
    <Modal opened={props.opened} onClose={props.onClose} withCloseButton={false}>
      <Alert color="red" title="Warning" icon={<IconAlertCircle />}>
        Are you sure you want to delete this task?
        <Group>
          <Button onClick={props.onDelete} color="red">
            Yes, Delete
          </Button>
          <Button onClick={props.onClose} color="red" variant="outline">
            Cancel
          </Button>
        </Group>
      </Alert>
    </Modal>
  );
}
