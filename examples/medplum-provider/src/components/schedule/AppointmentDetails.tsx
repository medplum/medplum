// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Group, Stack, Text, Tooltip } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference, EMPTY, formatHumanName, formatPeriod, isReference, isResource } from '@medplum/core';
import type { Appointment, Bundle, Coding, Patient, PlanDefinition, Practitioner, Slot } from '@medplum/fhirtypes';
import { CodingInput, Form, MedplumLink, ResourceAvatar, ResourceInput, useMedplum } from '@medplum/react';
import { useResource } from '@medplum/react-hooks';
import { IconAlertSquareRounded, IconFileCheck, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { createEncounter } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { PlanDefinitionSummary } from '../plandefinition/PlanDefinitionSummary';

type UpdateAppointmentFormProps = {
  appointment: WithId<Appointment>;
  onUpdate: (appointment: WithId<Appointment>) => void;
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

    let result: WithId<Appointment>;
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
  appointment: WithId<Appointment>;
  onAppointmentUpdate: (appointment: WithId<Appointment>) => void;
  onSlotUpdate: (slot: WithId<Slot>) => void;
}): JSX.Element {
  const medplum = useMedplum();
  const [planDefinition, setPlanDefinition] = useState<PlanDefinition | undefined>();
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>();

  // Extract references to a Patient and a Practitioner from `Appointment.participants`; we expect
  // one of each.
  const participants = props.appointment.participant.map((p) => p.actor);
  const patientRef = participants.find((r) => isReference<Patient>(r, 'Patient'));
  const practitionerRef = participants.find((r) => isReference<Practitioner>(r, 'Practitioner'));

  const patient = useResource(patientRef);
  const navigate = useNavigate();
  const { appointment, onAppointmentUpdate, onSlotUpdate } = props;

  const handleSubmit = useCallback(async () => {
    if (!patient) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Patient not loaded',
      });
      return;
    }

    if (!practitionerRef) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Appointment has no Practitioner participant',
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
        patient,
        planDefinition,
        props.appointment,
        practitionerRef
      );

      navigate(`/Patient/${patient.id}/Encounter/${encounter.id}`)?.catch(console.error);
    } catch (err) {
      showErrorNotification(err);
    }
  }, [medplum, patient, encounterClass, planDefinition, props.appointment, navigate, practitionerRef]);

  const cancellable =
    appointment.status === 'booked' || appointment.status === 'pending' || appointment.status === 'proposed';
  const cancelTooltip = cancellable ? null : `Can't cancel appointment with status "${appointment.status}"`;
  const [cancelLoading, setCancelLoading] = useState(false);

  const handleCancel = useCallback(async () => {
    setCancelLoading(true);
    try {
      const updated = await medplum.post<WithId<Appointment>>(
        medplum.fhirUrl('Appointment', appointment.id, '$cancel')
      );
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');
      onAppointmentUpdate(updated);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setCancelLoading(false);
    }
  }, [medplum, appointment, onAppointmentUpdate]);

  const confirmable = appointment.status === 'pending';
  const [confirmLoading, setConfirmLoading] = useState(false);
  const handleConfirm = useCallback(async () => {
    if (!confirmable) {
      console.error(new Error(`handleConfirm called from non confirmable status '${appointment.status}'`));
      return;
    }
    setConfirmLoading(true);
    try {
      const updated = await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
        medplum.fhirUrl('Appointment', appointment.id, '$confirm')
      );
      medplum.invalidateSearches('Appointment');
      medplum.invalidateSearches('Slot');
      const updatedResources = updated.entry?.map((entry) => entry.resource) ?? EMPTY;
      const updatedAppointment = updatedResources.find((res) => isResource<Appointment>(res, 'Appointment'));
      const updatedSlots = updatedResources.filter((res) => isResource<Slot>(res, 'Slot'));
      if (updatedAppointment) {
        onAppointmentUpdate(updatedAppointment);
      }
      for (const updatedSlot of updatedSlots) {
        onSlotUpdate(updatedSlot);
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setConfirmLoading(false);
    }
  }, [medplum, appointment, confirmable, onAppointmentUpdate, onSlotUpdate]);

  return (
    <Stack gap="md">
      <Text size="lg">{formatPeriod({ start: props.appointment.start, end: props.appointment.end })}</Text>
      {!patientRef && <UpdateAppointmentForm appointment={props.appointment} onUpdate={props.onAppointmentUpdate} />}

      {!!patient && (
        <>
          <Group align="center" gap="sm">
            <MedplumLink to={patient}>
              <ResourceAvatar value={patient} size={48} radius={48} />
            </MedplumLink>
            <MedplumLink to={patient} fw={800} size="lg">
              {formatHumanName(patient.name?.[0])}
            </MedplumLink>
          </Group>
          <div>
            <h3>Set Up Encounter</h3>
            <Form onSubmit={handleSubmit}>
              <Stack gap="md">
                <ResourceInput<Practitioner>
                  name="practitioner"
                  resourceType="Practitioner"
                  label="Practitioner"
                  defaultValue={practitionerRef}
                  disabled={true}
                  required={true}
                />

                <CodingInput
                  name="class"
                  label="Encounter Class"
                  binding="http://terminology.hl7.org/ValueSet/v3-ActEncounterCode"
                  required={true}
                  onChange={setEncounterClass}
                  path="Encounter.class"
                />

                <ResourceInput<PlanDefinition>
                  name="plandefinition"
                  resourceType="PlanDefinition"
                  label="Care template"
                  onChange={setPlanDefinition}
                  required={true}
                />

                <PlanDefinitionSummary planDefinition={planDefinition} />

                <Button fullWidth type="submit" disabled={!planDefinition || !encounterClass}>
                  Apply
                </Button>
              </Stack>
            </Form>
          </div>
        </>
      )}
      <Divider my="md" />
      {confirmable && (
        <Button
          loading={confirmLoading}
          onClick={handleConfirm}
          variant="outline"
          leftSection={<IconFileCheck size={16} />}
        >
          Confirm Appointment
        </Button>
      )}
      <Tooltip label={cancelTooltip} disabled={!cancelTooltip}>
        <Button
          loading={cancelLoading}
          onClick={handleCancel}
          variant="outline"
          color="red"
          leftSection={<IconTrash size={16} />}
          data-disabled={!cancellable}
        >
          Cancel Visit
        </Button>
      </Tooltip>
    </Stack>
  );
}
