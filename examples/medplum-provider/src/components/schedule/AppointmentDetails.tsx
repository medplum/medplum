// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { MedplumLink, ResourceAvatar } from '@medplum/react';
import { useResource } from '@medplum/react-hooks';
import { formatHumanName, formatPeriod } from '@medplum/core';
import type { Appointment, Patient, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';

export function AppointmentDetails(props: { appointment: Appointment }): JSX.Element {
  const participantRef = props.appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
  const patientParticipant = useResource(participantRef?.actor as Reference<Patient>);

  return (
    <Stack gap="md">
      <Text size="lg">{formatPeriod({ start: props.appointment.start, end: props.appointment.end })}</Text>

      {patientParticipant && (
        <Group align="center" gap="sm">
          <MedplumLink to={patientParticipant}>
            <ResourceAvatar value={patientParticipant} size={48} radius={48} />
          </MedplumLink>
          <MedplumLink to={patientParticipant} fw={800} size="lg">
            {formatHumanName(patientParticipant.name?.[0])}
          </MedplumLink>
        </Group>
      )}
    </Stack>
  );
}
