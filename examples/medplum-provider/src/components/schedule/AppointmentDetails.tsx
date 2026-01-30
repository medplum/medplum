// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Stack, Text } from '@mantine/core';
import { Form, MedplumLink, ResourceAvatar, ResourceInput, useMedplum } from '@medplum/react';
import { useResource } from '@medplum/react-hooks';
import { createReference, formatHumanName, formatPeriod } from '@medplum/core';
import type { Appointment, Patient, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

function UpdateAppointmentForm(props: {
  appointment: Appointment;
  onUpdate: (appointment: Appointment) => void;
}): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient | undefined>(undefined);

  const { appointment, onUpdate } = props;
  const handleSubmit = useCallback(async () => {
    if (patient) {
      const updated = {
        ...appointment,
        participant: [
          ...appointment.participant,
          {
            actor: createReference(patient),
            status: 'tentative',
          },
        ],
      } satisfies Appointment;

      let result: Appointment;
      try {
        result = await medplum.updateResource(updated);
      } catch (error) {
        showErrorNotification(error);
        return;
      }
      onUpdate?.(result);
    }
  }, [medplum, patient, appointment, onUpdate]);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack gap="md">
        <ResourceInput
          label="Patient"
          resourceType="Patient"
          name="Patient-id"
          required={true}
          onChange={(value) => setPatient(value as Patient)}
        />

        <Button fullWidth type="submit">
          Update Appointment
        </Button>
      </Stack>
    </Form>
  );
}

export function AppointmentDetails(props: {
  appointment: Appointment;
  onUpdate: (appointment: Appointment) => void;
}): JSX.Element {
  const participantRef = props.appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
  const patientParticipant = useResource(participantRef?.actor as Reference<Patient> | undefined);

  return (
    <Stack gap="md">
      <Text size="lg">{formatPeriod({ start: props.appointment.start, end: props.appointment.end })}</Text>

      {!participantRef && <UpdateAppointmentForm appointment={props.appointment} onUpdate={props.onUpdate} />}

      {!!patientParticipant && (
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
