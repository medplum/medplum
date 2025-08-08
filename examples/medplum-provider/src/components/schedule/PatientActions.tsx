// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Title } from '@mantine/core';
import { Patient, Schedule } from '@medplum/fhirtypes';
import { Loading } from '@medplum/react';
import { IconClock } from '@tabler/icons-react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';

interface PatientActionsProps {
  readonly schedule: Schedule;
  readonly patient: Patient;
}

export function PatientActions(props: PatientActionsProps): JSX.Element {
  const { schedule, patient } = props;
  const navigate = useNavigate();

  if (!schedule) {
    return <Loading />;
  }

  return (
    <Stack p="xs" m="xs">
      <Title>Patient Actions</Title>

      <Button
        leftSection={<IconClock size={16} />}
        onClick={() => navigate(`/Patient/${patient.id}/Schedule/${schedule.id}`)?.catch(console.error)}
      >
        Create Appointment
      </Button>
    </Stack>
  );
}
