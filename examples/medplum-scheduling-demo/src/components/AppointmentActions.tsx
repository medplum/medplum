import { Button, Stack, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { createReference, normalizeErrorString } from '@medplum/core';
import { Appointment, Encounter, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { IconCancel, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RescheduleAppointment } from './RescheduleAppointment';

interface AppointmentActionsProps {
  appointment: Appointment;
  patient: Patient;
}

export function AppointmentActions(props: AppointmentActionsProps): JSX.Element {
  const { appointment, patient } = props;
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [rescheduleOpened, rescheduleHandlers] = useDisclosure(false);
  const [encounter, setEncounter] = useState<Encounter | undefined | boolean>(false); // `false` means it was not loaded yet

  const refreshEncounter = useCallback(async (): Promise<void> => {
    try {
      const result = await medplum.searchOne('Encounter', { appointment: `Appointment/${appointment.id}` });
      setEncounter(result);
    } catch (err) {
      console.error(err);
    }
  }, [medplum, appointment.id]);

  useEffect(() => {
    refreshEncounter().catch(console.error);
  }, [refreshEncounter]);

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
      const patientReference = createReference(patient);
      const participant = appointment.participant?.filter((p) => p.actor?.reference !== patientReference.reference);

      const duration = new Date(appointment.end as string).getTime() - new Date(appointment.start as string).getTime();

      const createdEncounter = await medplum.createResource({
        resourceType: 'Encounter',
        status: 'finished',
        subject: createReference(patient),
        appointment: [createReference(appointment)],
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'VR',
          display: 'virtual',
        },
        serviceType: appointment.serviceType?.[0],
        period: {
          start: appointment.start,
          end: appointment.end,
        },
        length: {
          value: Math.floor(duration / 60000),
          unit: 'minutes',
        },
        participant: participant.map((p) => ({
          individual: p.actor as Reference<Practitioner>,
          type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND' }] }],
        })),
      });

      setEncounter(createdEncounter);
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
      {/* Only show "Mark completed" if not already completed or cancelled */}
      {!['fulfilled', 'cancelled'].includes(appointment.status) ? (
        <Button leftSection={<IconCircleCheck size={16} />} onClick={() => handleChangeStatus('fulfilled')}>
          Mark completed
        </Button>
      ) : null}
      {/* Only show "Reschedule" if not already completed */}
      {appointment.status !== 'fulfilled' ? (
        <Button leftSection={<IconCircleCheck size={16} />} onClick={() => rescheduleHandlers.open()}>
          Reschedule
        </Button>
      ) : null}
      {/*
       * Only show "Create Encounter" if appointment is already fulfilled
       * and after we finish trying to load the encounter and it doesn't already exist
       */}
      {appointment.status === 'fulfilled' && !encounter && encounter !== false ? (
        <Button leftSection={<IconCircleCheck size={16} />} onClick={createEncounter}>
          Create Encounter
        </Button>
      ) : null}
      {/* Only show "Cancel" if not already cancelled */}
      {appointment.status !== 'cancelled' ? (
        <Button leftSection={<IconCancel size={16} />} onClick={() => handleChangeStatus('cancelled')}>
          Cancel
        </Button>
      ) : null}
    </Stack>
  );
}
