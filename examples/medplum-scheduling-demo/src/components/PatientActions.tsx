import { Button, Stack, Title } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { CreateAppointment } from './CreateAppointment';
import { useDisclosure } from '@mantine/hooks';
import { Patient } from '@medplum/fhirtypes';

interface PatientActionsProps {
  patient: Patient;
}

export function PatientActions(props: PatientActionsProps): JSX.Element {
  const { patient } = props;
  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);

  return (
    <Stack p="xs" m="xs">
      <Title>Patient Actions</Title>
      <CreateAppointment patient={patient} opened={createAppointmentOpened} handlers={createAppointmentHandlers} />
      <Button leftSection={<IconClock size={16} />} onClick={() => createAppointmentHandlers.open()}>
        Create Appointment
      </Button>
    </Stack>
  );
}
