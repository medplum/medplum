import { Button, Stack, Title } from '@mantine/core';
import { IconCancel, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { Appointment } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { normalizeErrorString } from '@medplum/core';
import { RescheduleAppointment } from './RescheduleAppointment';
import { useDisclosure } from '@mantine/hooks';

interface AppointmentActionsProps {
  appointment: Appointment;
}

export function AppointmentActions(props: AppointmentActionsProps): JSX.Element {
  const { appointment } = props;
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [opened, handlers] = useDisclosure(false);

  if (!appointment) {
    return <Loading />;
  }

  async function handleChangeStatus(newStatus: Appointment['status']): Promise<void> {
    try {
      await medplum.updateResource({
        ...appointment,
        status: newStatus,
      });
      navigate(`/Appointment/${appointment.id}/details`);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Appointment status updated',
      });
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  return (
    <Stack p="xs" m="xs">
      <Title>Appointment Actions</Title>
      <RescheduleAppointment appointment={appointment} opened={opened} handlers={handlers} />
      {appointment.status !== 'fulfilled' ? (
        <>
          <Button leftSection={<IconCircleCheck size={16} />} onClick={() => handleChangeStatus('fulfilled')}>
            Mark completed
          </Button>
          <Button leftSection={<IconCircleCheck size={16} />} onClick={() => handlers.open()}>
            Reschedule
          </Button>
        </>
      ) : null}
      {appointment.status !== 'cancelled' ? (
        <Button leftSection={<IconCancel size={16} />} onClick={() => handleChangeStatus('cancelled')}>
          Cancel
        </Button>
      ) : null}
    </Stack>
  );
}
