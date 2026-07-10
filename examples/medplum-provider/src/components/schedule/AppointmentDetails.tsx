// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Group, Loader, Stack, Text, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  createReference,
  EMPTY,
  formatDateTime,
  getExtension,
  getReferenceString,
  isDefined,
  isOk,
  isReference,
  isResource,
  parseReference,
  resolveId,
} from '@medplum/core';
import type { Appointment, Bundle, CodeableConcept, Patient, Slot } from '@medplum/fhirtypes';
import {
  CodeableConceptDisplay,
  Form,
  MedplumLink,
  OperationOutcomeAlert,
  ResourceAvatar,
  ResourceInput,
  ResourceName,
  useMedplum,
} from '@medplum/react';
import { useSearchOne } from '@medplum/react-hooks';
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
}): JSX.Element {
  const { appointment, onAppointmentUpdate } = props;
  const medplum = useMedplum();

  const [encounter, encounterLoading, encounterOutcome] = useSearchOne(
    'Encounter',
    {
      appointment: getReferenceString(appointment),
    },
    {
      // Disable debouncer for faster encounter loading. This search is not driven by
      // keyboard input and so won't benefit from debouncing.
      debounceMs: 0,
    }
  );

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
      // $cancel is a custom operation, so the client cannot classify its modifications
      // itself; announce them to invalidate caches and notify interested components.
      medplum.notifyResourceModified({
        resourceType: 'Appointment',
        operation: 'update',
        id: updated.id,
        resource: updated,
      });

      // The $cancel operation soft-deletes the appointment's slots, but does
      // not return any kind of tombstone for them, so we read the remaining
      // pointers from the appointment resource and mark them as deleted.
      updated.slot?.forEach((slot) => {
        medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'delete', id: resolveId(slot) });
      });
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
      const updatedResources = updated.entry?.map((entry) => entry.resource) ?? EMPTY;
      const updatedAppointment = updatedResources.find((res) => isResource<Appointment>(res, 'Appointment'));
      const updatedSlots = updatedResources.filter((res) => isResource<Slot>(res, 'Slot'));
      // $confirm is a custom operation, so the client cannot classify its modifications
      // itself; announce them to invalidate caches and notify interested components.
      medplum.notifyResourceModified({
        resourceType: 'Appointment',
        operation: 'update',
        id: updatedAppointment?.id,
        resource: updatedAppointment,
      });
      updatedSlots.forEach((slot) => {
        medplum.notifyResourceModified({
          resourceType: 'Slot',
          operation: 'update',
          id: slot.id,
          resource: slot,
        });
      });
      if (updatedAppointment) {
        onAppointmentUpdate(updatedAppointment);
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setConfirmLoading(false);
    }
  }, [medplum, appointment, confirmable, onAppointmentUpdate]);

  const sortedParticipants = appointment.participant
    .map((participant) => {
      const actor = participant.actor;
      if (!isReference(actor)) {
        return undefined;
      }
      const [resourceType] = parseReference(actor);
      return { actor, resourceType };
    })
    .filter(isDefined)
    .sort((a, b) => (a.resourceType === 'Patient' ? 0 : 1) - (b.resourceType === 'Patient' ? 0 : 1));

  // If there is a "Patient" participant, we sorted it to the front of the list, so we can
  // check just the first entry.
  const hasPatient = sortedParticipants[0]?.resourceType === 'Patient';

  return (
    <Stack gap="md" className={classes.AppointmentDetails}>
      <Divider />

      {!hasPatient && <UpdateAppointmentForm appointment={props.appointment} onUpdate={props.onAppointmentUpdate} />}

      {sortedParticipants.map(({ actor, resourceType }, index) => {
        return (
          <Group align="center" gap="sm" key={`${actor.reference ?? ''}_${index}`}>
            <MedplumLink to={actor} tabIndex={-1}>
              <ResourceAvatar value={actor} size={48} radius={48} />
            </MedplumLink>
            <div>
              <ResourceName value={actor} size="lg" fw={800} link />
              <Text size="xs" c="dimmed">
                {resourceType}
              </Text>
            </div>
          </Group>
        );
      })}

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
      {hasPatient && !encounter && !encounterLoading && encounterOutcome && isOk(encounterOutcome) && (
        <CreateEncounterForm appointment={appointment} />
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
