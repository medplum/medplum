import { Button, Group, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, PatchOperation } from '@medplum/core';
import { Communication } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface CloseOpenThreadProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function CloseOpenThread(props: CloseOpenThreadProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, handlers] = useDisclosure(false);
  const status = props.communication.status;

  // Check the status to see if the thread should be closed or reopened
  const display = status === 'completed' ? 'Reopen' : 'Close';

  async function handleStatusUpdate(): Promise<void> {
    const communicationId = props.communication.id as string;
    // Update the status to the opposite of the current status
    const updatedStatus = status === 'completed' ? 'in-progress' : 'completed';

    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: props.communication.meta?.versionId },
      { op: 'replace', path: '/status', value: updatedStatus },
    ];

    try {
      // Update the thread to the new status
      const result = await medplum.patchResource('Communication', communicationId, ops);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: `Thread ${display === 'Close' ? 'closed.' : 'reopened.'}`,
      });
      props.onChange(result);
      handlers.close();
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

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
