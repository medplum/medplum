import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

export function FinalizeNote(): JSX.Element {
  const [opened, handlers] = useDisclosure(false);

  return (
    <div>
      <Button fullWidth onClick={handlers.open}>
        Finalize Note
      </Button>
      <Modal opened={opened} onClose={handlers.close}>
        Finalize the note (Does not currently do anything)
      </Modal>
    </div>
  );
}
