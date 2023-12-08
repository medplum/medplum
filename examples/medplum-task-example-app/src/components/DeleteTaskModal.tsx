import { Alert, Button, Group, Modal } from '@mantine/core';

interface DeleteTaskModalProps {
  onDelete: () => void;
  opened: boolean;
  onClose: () => void;
}

export function DeleteTaskModal(props: DeleteTaskModalProps): JSX.Element {
  return (
    <Modal opened={props.opened} onClose={props.onClose}>
      <Alert color="red" title="Are you sure you want to delete?">
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
