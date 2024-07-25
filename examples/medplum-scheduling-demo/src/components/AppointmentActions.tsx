import { Button, Stack, Title } from '@mantine/core';
import { IconCancel, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { Appointment, Encounter, Patient, Practitioner } from '@medplum/fhirtypes';
import { Loading, useMedplum, useMedplumProfile } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { createReference, normalizeErrorString } from '@medplum/core';
import { RescheduleAppointment } from './RescheduleAppointment';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';

interface AppointmentActionsProps {
  appointment: Appointment;
  patient: Patient;
}

export function AppointmentActions(props: AppointmentActionsProps): JSX.Element {
  const { appointment, patient } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();
  const [rescheduleOpened, rescheduleHandlers] = useDisclosure(false);
  const [encounter, setEncounter] = useState<Encounter | undefined | boolean>(false); // `false` means it was not loaded yet

  async function refreshEncounter(): Promise<void> {
    try {
      const result = await medplum.searchOne('Encounter', { appointment: `Appointment/${appointment.id}` });
      setEncounter(result);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    refreshEncounter().catch(console.error);
  }, []);

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

  async function createEncounter(): Promise<void> {
    try {
      await medplum.createResource({
        resourceType: 'Encounter',
        status: 'finished',
        subject: createReference(patient),
        appointment: [createReference(appointment)],
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'AMB',
          display: 'ambulatory',
        },
        serviceType: appointment.serviceType?.[0],
        period: {
          start: appointment.start,
          end: appointment.end,
        },
        participant: [
          {
            // Uses the logged user as the attender
            individual: createReference(profile),
            type: [
              { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND' }] },
            ],
          },
        ],
      });

      await refreshEncounter();
      navigate(`/Appointment/${appointment.id}/encounters`);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Encounter created',
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
      {appointment.status === 'fulfilled' && !encounter && encounter !== false ? ( // Only show "Create Encounter" if already completed
        <Button leftSection={<IconCircleCheck size={16} />} onClick={createEncounter}>
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
