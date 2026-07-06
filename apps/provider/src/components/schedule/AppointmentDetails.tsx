// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Group, Loader, Stack, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  createReference,
  EMPTY,
  formatDateTime,
  formatHumanName,
  getExtension,
  getReferenceString,
  isOk,
  isReference,
  isResource,
} from '@medplum/core';
import type { Appointment, Bundle, CodeableConcept, Patient, Practitioner, Slot } from '@medplum/fhirtypes';
import {
  CodeableConceptDisplay,
  Form,
  MedplumLink,
  OperationOutcomeAlert,
  ResourceAvatar,
  ResourceInput,
  useMedplum,
} from '@medplum/react';
import { useResource, useSearchOne } from '@medplum/react-hooks';
import { IconFileCheck, IconNotes, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { encounterUrl } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { ServiceTypeReferenceURI } from '../../utils/servicetype';
import classes from './AppointmentDetails.module.css';
import { CreateEncounterForm } from './CreateEncounterForm';

// Medplum `serviceType` values may include an extension linking to a
// HealthcareService; if present, use that as our display name first.
// Fall back to normal CodeableConcept display otherwise.
function ServiceTypeDisplay(props: { value: CodeableConcept }): JSX.Element {
  const { value } = props;

  const ext = getExtension(value, ServiceTypeReferenceURI);
  if (ext?.valueReference?.display) {
    return <>{ext.valueReference.display}</>;
  }
  return <CodeableConceptDisplay value={value} />;
}

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

export function AppointmentDetails(props: {
  appointment: WithId<Appointment>;
  onAppointmentUpdate: (appointment: WithId<Appointment>) => void;
  onSlotUpdate: (slot: WithId<Slot>) => void;
}): JSX.Element {
  const { appointment, onAppointmentUpdate, onSlotUpdate } = props;
  const medplum = useMedplum();

  const [encounter, encounterLoading, encounterOutcome] = useSearchOne('Encounter', {
    appointment: getReferenceString(appointment),
  });

  // Extract references to a Patient and a Practitioner from `Appointment.participants`; we expect
  // one of each.
  const participants = props.appointment.participant.map((p) => p.actor);
  const patientRef = participants.find((r) => isReference<Patient>(r, 'Patient'));
  const practitionerRef = participants.find((r) => isReference<Practitioner>(r, 'Practitioner'));

  const patient = useResource(patientRef);

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
    <Stack gap="md" className={classes.AppointmentDetails}>
      <Divider />

      {!patientRef && <UpdateAppointmentForm appointment={props.appointment} onUpdate={props.onAppointmentUpdate} />}

      {!!patient && (
        <Group align="center" gap="sm">
          <MedplumLink to={patient}>
            <ResourceAvatar value={patient} size={48} radius={48} />
          </MedplumLink>
          <MedplumLink to={patient} fw={800} size="lg">
            {formatHumanName(patient.name?.[0])}
          </MedplumLink>
        </Group>
      )}

      <Divider />

      <dl className={classes.metadata}>
        <dt>Appointment Start</dt>
        <dd>{formatDateTime(props.appointment.start)}</dd>

        <dt>Appointment End</dt>
        <dd>{formatDateTime(props.appointment.end)}</dd>

        {(props.appointment.serviceType ?? EMPTY).length > 0 && (
          <>
            <dt>Service Type</dt>
            {(props.appointment.serviceType ?? EMPTY).map((serviceType, index) => (
              <dd key={index}>
                <ServiceTypeDisplay value={serviceType} />
              </dd>
            ))}
          </>
        )}
      </dl>

      <Divider />

      {encounterLoading && (
        <Group justify="center">
          <Loader size="sm" />
        </Group>
      )}
      {encounterOutcome && !isOk(encounterOutcome) && (
        <OperationOutcomeAlert outcome={encounterOutcome} title="Loading Encounter failed" />
      )}
      {patientRef && !encounter && !encounterLoading && encounterOutcome && isOk(encounterOutcome) && (
        <CreateEncounterForm appointment={appointment} patientRef={patientRef} practitionerRef={practitionerRef} />
      )}

      <Divider />

      {encounter && (
        <Button
          component={Link}
          to={encounterUrl(encounter)}
          leftSection={<IconNotes size={16} />}
          variant="outline"
          color="dark"
        >
          View Encounter
        </Button>
      )}
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
