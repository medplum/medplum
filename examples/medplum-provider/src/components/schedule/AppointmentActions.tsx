// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Appointment, Encounter, Patient } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { IconCancel, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CreateEncounter } from './CreateEncounter';
import { RescheduleAppointment } from './RescheduleAppointment';

interface AppointmentActionsProps {
  appointment: Appointment;
  patient: Patient;
}

export function AppointmentActions(props: AppointmentActionsProps): JSX.Element {
  const { appointment, patient } = props;
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [createEncounterOpened, createEncounterHandlers] = useDisclosure(false);
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

  async function handleCancelAppointment(): Promise<void> {
    try {
      // Call bot to cancel the appointment
      await medplum.executeBot({ system: 'http://example.com', value: 'cancel-appointment' }, appointment);

      navigate('/Appointment/upcoming')?.catch(console.error);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Appointment cancelled',
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
      <CreateEncounter
        appointment={appointment}
        patient={patient}
        opened={createEncounterOpened}
        handlers={createEncounterHandlers}
      />
      <RescheduleAppointment appointment={appointment} opened={rescheduleOpened} handlers={rescheduleHandlers} />
      {/*
       * Only show "Create Encounter" if appointment is not already completed or cancelled
       * and after we finish trying to load the encounter and it doesn't already exist
       */}
      {!['fulfilled', 'cancelled'].includes(appointment.status) && !encounter && encounter !== false ? (
        <Button leftSection={<IconCircleCheck size={16} />} onClick={() => createEncounterHandlers.open()}>
          Create Encounter
        </Button>
      ) : null}
      {/* Only show "Reschedule" if not already completed */}
      {appointment.status !== 'fulfilled' ? (
        <Button leftSection={<IconCircleCheck size={16} />} onClick={() => rescheduleHandlers.open()}>
          Reschedule
        </Button>
      ) : null}
      {/* Only show "Cancel" if not already cancelled */}
      {appointment.status !== 'cancelled' ? (
        <Button leftSection={<IconCancel size={16} />} onClick={() => handleCancelAppointment()}>
          Cancel
        </Button>
      ) : null}
    </Stack>
  );
}
