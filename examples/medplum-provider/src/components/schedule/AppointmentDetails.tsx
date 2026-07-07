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
} from '@medplum/core';
import type { Appointment, CodeableConcept, Patient, Practitioner } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Form, MedplumLink, ResourceAvatar, ResourceInput } from '@medplum/react';
import { useResource, useSearchOne } from '@medplum/react-hooks';
import { IconFileCheck, IconNotes, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import type { SchedulingAPI } from '../../hooks/useSchedulingResources';
import { encounterUrl } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { ServiceTypeReferenceURI } from '../../utils/servicetype';
import { OutcomeAlert } from '../OutcomeAlert';
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
  updateAppointment: (appointment: WithId<Appointment>) => Promise<WithId<Appointment>>;
  onAppointmentUpdate: (appointment: WithId<Appointment>) => void;
};

function UpdateAppointmentForm(props: UpdateAppointmentFormProps): JSX.Element {
  const [patient, setPatient] = useState<Patient | undefined>(undefined);

  const { appointment, updateAppointment, onAppointmentUpdate } = props;
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

    try {
      onAppointmentUpdate(await updateAppointment(updated));
    } catch (error) {
      showErrorNotification(error);
    }
  }, [patient, appointment, updateAppointment, onAppointmentUpdate]);

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

function isConfirmable(appointment: Appointment): boolean {
  return appointment.status === 'pending';
}

export function AppointmentDetails(props: {
  appointment: WithId<Appointment>;
  schedulingAPI: SchedulingAPI;
  onAppointmentUpdate: (appointment: WithId<Appointment>) => void;
}): JSX.Element {
  const { appointment, schedulingAPI, onAppointmentUpdate } = props;

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
      const result = await schedulingAPI.cancel(appointment);
      onAppointmentUpdate(result);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setCancelLoading(false);
    }
  }, [schedulingAPI, onAppointmentUpdate, appointment]);

  const [confirmLoading, setConfirmLoading] = useState(false);
  const handleConfirm = useCallback(async () => {
    if (!isConfirmable(appointment)) {
      console.error(new Error(`handleConfirm called from non confirmable status '${appointment.status}'`));
      return;
    }
    setConfirmLoading(true);
    try {
      const result = await schedulingAPI.confirm(appointment);
      onAppointmentUpdate(result.appointment);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setConfirmLoading(false);
    }
  }, [schedulingAPI, onAppointmentUpdate, appointment]);

  return (
    <Stack gap="md" className={classes.AppointmentDetails}>
      <Divider />

      {!patientRef && (
        <UpdateAppointmentForm
          appointment={props.appointment}
          updateAppointment={schedulingAPI.updateAppointment}
          onAppointmentUpdate={props.onAppointmentUpdate}
        />
      )}

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
      <OutcomeAlert outcome={encounterOutcome} title="Encounter Loading Issue" />
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
      {isConfirmable(appointment) && (
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
