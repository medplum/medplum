import { Button, Flex, Group, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { PatchOperation } from '@medplum/core';
import { Communication } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';

interface CloseOpenThreadProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function CloseOpenThread(props: CloseOpenThreadProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, handlers] = useDisclosure(false);
  const status = props.communication.status;

  const display = status === 'completed' ? 'Reopen' : 'Close';

  const handleStatusUpdate = async () => {
    const communicationId = props.communication.id as string;
    const updatedStatus = status === 'completed' ? 'active' : 'completed';

    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: props.communication.meta?.versionId },
      { op: 'replace', path: '/status', value: updatedStatus },
    ];

    try {
      const result = await medplum.patchResource('Communication', communicationId, ops);
      console.log('Success');
      props.onChange(result);
      handlers.close();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <Button fullWidth onClick={handlers.toggle}>
        {display} Thread
      </Button>
      <Modal
        opened={opened}
        onClose={handlers.close}
        title={`Are you sure you want to ${display.toLowerCase()} this thread?`}
      >
        <Group>
          <Button onClick={handleStatusUpdate}>{display}</Button>
          <Button color="red" onClick={handlers.close}>
            Cancel
          </Button>
        </Group>
      </Modal>
    </div>
  );
}
