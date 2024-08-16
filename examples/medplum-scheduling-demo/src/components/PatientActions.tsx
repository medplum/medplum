import { Button, Stack, Title } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { Patient } from '@medplum/fhirtypes';
import { useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { ScheduleContext } from '../Schedule.context';
import { Loading } from '@medplum/react';

interface PatientActionsProps {
  patient: Patient;
}

export function PatientActions(props: PatientActionsProps): JSX.Element {
  const { patient } = props;
  const navigate = useNavigate();
  const { schedule } = useContext(ScheduleContext);

  if (!schedule) {
    return <Loading />;
  }

  return (
    <Stack p="xs" m="xs">
      <Title>Patient Actions</Title>

      <Button
        leftSection={<IconClock size={16} />}
        onClick={() => navigate(`/Patient/${patient.id}/Schedule/${schedule.id}`)}
      >
        Create Appointment
      </Button>
    </Stack>
  );
}
