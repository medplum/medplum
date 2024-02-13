import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

export function EditCoverage(): JSX.Element {
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <div>
      <Button fullWidth onClick={toggle}>
        Edit Coverage
      </Button>
      <Modal opened={opened} onClose={close}>
        <p>Edit Coverage</p>
      </Modal>
    </div>
  );
}
