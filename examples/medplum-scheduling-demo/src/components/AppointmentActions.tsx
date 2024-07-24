import { Button, Stack, Title } from '@mantine/core';
import { IconCancel, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { Appointment, Patient } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { normalizeErrorString } from '@medplum/core';
import { RescheduleAppointment } from './RescheduleAppointment';
import { useDisclosure } from '@mantine/hooks';
import { CreateEncounter } from './CreateEncounter';

interface AppointmentActionsProps {
  appointment: Appointment;
  patient: Patient;
}

export function AppointmentActions(props: AppointmentActionsProps): JSX.Element {
  const { appointment, patient } = props;
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [rescheduleOpened, rescheduleHandlers] = useDisclosure(false);
  const [encounterOpened, encounterHandlers] = useDisclosure(false);

  if (!appointment) {
    return <Loading />;
  }

  // Handler for completing or cancelling the appointment
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
      <RescheduleAppointment appointment={appointment} opened={rescheduleOpened} handlers={rescheduleHandlers} />
      <CreateEncounter
        appointment={appointment}
        patient={patient}
        opened={encounterOpened}
        handlers={encounterHandlers}
      />
      {!['fulfilled', 'cancelled'].includes(appointment.status) ? ( // Only show "Mark completed" if not already completed or cancelled
        <Button leftSection={<IconCircleCheck size={16} />} onClick={() => handleChangeStatus('fulfilled')}>
          Mark completed
        </Button>
      ) : null}
      {appointment.status !== 'fulfilled' ? ( // Only show "Reschedule" if not already completed
        <Button leftSection={<IconCircleCheck size={16} />} onClick={() => rescheduleHandlers.open()}>
          Reschedule
        </Button>
      ) : null}
      {appointment.status === 'fulfilled' ? ( // Only show "Create Encounter" if already completed
        <Button leftSection={<IconCircleCheck size={16} />} onClick={() => encounterHandlers.open()}>
          Create Encounter
        </Button>
      ) : null}
      {appointment.status !== 'cancelled' ? ( // Only show "Cancel" if not already cancelled
        <Button leftSection={<IconCancel size={16} />} onClick={() => handleChangeStatus('cancelled')}>
          Cancel
        </Button>
      ) : null}
    </Stack>
  );
}
