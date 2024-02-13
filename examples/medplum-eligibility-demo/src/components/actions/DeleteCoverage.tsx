import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

export function DeleteCoverage(): JSX.Element {
  const [opened, { close, toggle }] = useDisclosure(false);

  return (
    <div>
      <Button fullWidth onClick={toggle} color="red">
        Delete Coverage
      </Button>
      <Modal opened={opened} onClose={close}>
        <p>Are you sure you want to delete this coverage?</p>
      </Modal>
    </div>
  );
}
