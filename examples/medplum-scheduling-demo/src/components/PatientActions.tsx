import { Button, Stack, Title } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconEdit } from '@tabler/icons-react';
import { CreateAppointment } from './CreateAppointment';
import { useDisclosure } from '@mantine/hooks';

export function PatientActions(): JSX.Element {
  const navigate = useNavigate();
  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);

  return (
    <Stack p="xs" m="xs">
      <Title>Patient Actions</Title>
      <CreateAppointment opened={createAppointmentOpened} handlers={createAppointmentHandlers} />
      <Button leftSection={<IconEdit size={16} />} onClick={() => createAppointmentHandlers.open()}>
        Create Appointment
      </Button>
    </Stack>
  );
}
