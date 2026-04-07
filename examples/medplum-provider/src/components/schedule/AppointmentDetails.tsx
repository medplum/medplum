// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, formatHumanName, formatPeriod } from '@medplum/core';
import type { Appointment, Coding, Patient, PlanDefinition, Reference } from '@medplum/fhirtypes';
import { CodingInput, Form, MedplumLink, ResourceAvatar, ResourceInput, useMedplum } from '@medplum/react';
import { useResource } from '@medplum/react-hooks';
import { IconAlertSquareRounded } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { createEncounter } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';

type UpdateAppointmentFormProps = {
  appointment: Appointment;
  onUpdate: (appointment: Appointment) => void;
};

function UpdateAppointmentForm(props: UpdateAppointmentFormProps): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient | undefined>(undefined);

  const { appointment, onUpdate } = props;
  const handleSubmit = useCallback(async () => {
    if (!patient) {
      return;
    }
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

// This component is used when an appointment does not have a related Encounter
// that we can direct the viewer to. It allows us to show some details for
// appointments that are not fully configured and offer UI to complete set up.
//
// As one example, this can be used after a patient has scheduled an appointment
// via $find/$hold to set up an Encounter and apply a plan definition to it.
export function AppointmentDetails(props: {
  appointment: Appointment;
  onUpdate: (appointment: Appointment) => void;
}): JSX.Element {
  const medplum = useMedplum();
  const [planDefinition, setPlanDefinition] = useState<PlanDefinition | undefined>();
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>();
  const participantRef = props.appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
  const patientParticipant = useResource(participantRef?.actor as Reference<Patient> | undefined);
  const navigate = useNavigate();

  const handleSubmit = useCallback(async () => {
    if (!patientParticipant) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Participant not loaded',
      });
      return;
    }

    if (!encounterClass || !planDefinition) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Please fill out required fields.',
      });
      return;
    }

    try {
      const encounter = await createEncounter(
        medplum,
        encounterClass,
        patientParticipant,
        planDefinition,
        props.appointment
      );

      navigate(`/Patient/${patientParticipant.id}/Encounter/${encounter.id}`)?.catch(console.error);
    } catch (err) {
      showErrorNotification(err);
    }
  }, [medplum, patientParticipant, encounterClass, planDefinition, props.appointment, navigate]);

  return (
    <Stack gap="md">
      <Text size="lg">{formatPeriod({ start: props.appointment.start, end: props.appointment.end })}</Text>

      {!participantRef && <UpdateAppointmentForm appointment={props.appointment} onUpdate={props.onUpdate} />}

      {!!patientParticipant && (
        <>
          <Group align="center" gap="sm">
            <MedplumLink to={patientParticipant}>
              <ResourceAvatar value={patientParticipant} size={48} radius={48} />
            </MedplumLink>
            <MedplumLink to={patientParticipant} fw={800} size="lg">
              {formatHumanName(patientParticipant.name?.[0])}
            </MedplumLink>
          </Group>
          <div>
            <h3>Set Up Encounter</h3>
            <Form onSubmit={handleSubmit}>
              <Stack gap="md">
                <CodingInput
                  name="class"
                  label="Encounter Class"
                  binding="http://terminology.hl7.org/ValueSet/v3-ActEncounterCode"
                  required={true}
                  onChange={setEncounterClass}
                  path="Encounter.type"
                />

                <ResourceInput<PlanDefinition>
                  name="plandefinition"
                  resourceType="PlanDefinition"
                  label="Care template"
                  onChange={setPlanDefinition}
                  required={true}
                />
                <Button fullWidth type="submit" disabled={!planDefinition || !encounterClass}>
                  Apply
                </Button>
              </Stack>
            </Form>
          </div>
        </>
      )}
    </Stack>
  );
}
