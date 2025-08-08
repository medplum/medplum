// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatPeriod, normalizeErrorString } from '@medplum/core';
import { Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff, IconClock, IconEdit, IconNote, IconTrash } from '@tabler/icons-react';
import { JSX } from 'react';
import { Event } from 'react-big-calendar';
import { CreateUpdateSlot } from './actions/CreateUpdateSlot';

interface SlotDetailsProps {
  event: Event | undefined;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
  readonly onSlotsUpdated: () => void;
}

/**
 * SlotDetails component that displays the details of a slot.
 * Allows the user to edit or delete the slot.
 * @param props - SlotDetailsProps
 * @returns A React component that displays the modal.
 */
export function SlotDetails(props: SlotDetailsProps): JSX.Element | null {
  const { event, opened, handlers, onSlotsUpdated } = props;
  const slot: Slot | undefined = event?.resource;

  const [updateSlotOpened, updateSlotHandlers] = useDisclosure(false, { onClose: handlers.close });

  const medplum = useMedplum();

  async function handleDeleteSlot(slotId: string): Promise<void> {
    try {
      await medplum.deleteResource('Slot', slotId);
      onSlotsUpdated();
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

  if (!slot) {
    return null;
  }

  const slotStatusTitle = slot.status === 'free' ? 'Available' : 'Blocked';

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

      <CreateUpdateSlot
        event={event}
        opened={updateSlotOpened}
        handlers={updateSlotHandlers}
        onSlotsUpdated={onSlotsUpdated}
      />
    </>
  );
}
