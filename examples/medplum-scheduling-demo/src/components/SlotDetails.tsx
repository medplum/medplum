import { Button, Group, Modal, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatPeriod, normalizeErrorString } from '@medplum/core';
import { Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff, IconClock, IconEdit, IconNote, IconTrash } from '@tabler/icons-react';
import { Event } from 'react-big-calendar';
import { CreateAppointment } from './CreateAppointment';
import { CreateUpdateSlot } from './CreateUpdateSlot';

interface SlotDetailsProps {
  event: Event | undefined;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function SlotDetails(props: SlotDetailsProps): JSX.Element {
  const { event, opened, handlers } = props;
  const slot: Slot | undefined = event?.resource;

  const [updateSlotOpened, updateSlotHandlers] = useDisclosure(false, { onClose: handlers.close });

  const medplum = useMedplum();

  // If the event is a range selection (no slot), render the slot creation modal
  if (!slot) {
    return <CreateUpdateSlot event={event} opened={opened} handlers={handlers} />;
  }

  // Handles deleting the slot
  async function handleDeleteSlot(slotId: string): Promise<void> {
    try {
      await medplum.deleteResource('Slot', slotId);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Slot deleted',
      });
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }

    handlers.close();
  }

  const slotStatusTitle = slot.status === 'free' ? 'Available' : 'Blocked';

  // If the event is a free slot (available for booking), render the appointment creation modal
  if (slot.status === 'free') {
    return <CreateAppointment slot={slot} opened={opened} handlers={handlers} />;
  }

  // If the event is a busy-unavailable slot (blocked for booking), show the slot details data
  return (
    <>
      <Modal
        opened={opened}
        onClose={handlers.close}
        title={
          <Group>
            <Button
              variant="subtle"
              size="compact-md"
              leftSection={<IconEdit size={16} />}
              onClick={() => updateSlotHandlers.open()}
            >
              Edit
            </Button>
            <Button
              variant="subtle"
              size="compact-md"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => handleDeleteSlot(slot.id as string)}
            >
              Delete
            </Button>
          </Group>
        }
      >
        <Stack>
          <Group>
            <IconClock />
            {formatPeriod({ start: slot.start, end: slot.end })}
          </Group>
          <Group>
            <IconNote />
            {slotStatusTitle}
          </Group>
        </Stack>
      </Modal>

      <CreateUpdateSlot event={event} opened={updateSlotOpened} handlers={updateSlotHandlers} />
    </>
  );
}
