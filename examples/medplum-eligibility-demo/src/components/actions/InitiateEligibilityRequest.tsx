import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

export function InitiateEligibilityRequest(): JSX.Element {
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <div>
      <Button fullWidth onClick={toggle}>
        Initiate Eligibility Request
      </Button>
      <Modal opened={opened} onClose={close}>
        <p>Initiate Eligibility Request</p>
      </Modal>
    </div>
  );
}
