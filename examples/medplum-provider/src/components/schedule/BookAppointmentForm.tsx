// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, EMPTY, formatPeriod, isDefined } from '@medplum/core';
import type { Appointment, Bundle, Patient, Resource, Slot } from '@medplum/fhirtypes';
import { Form, ResourceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { SchedulingTransientIdentifier } from '../../utils/scheduling';

type BookAppointmentFormProps = {
  appointment: Appointment;
  onSuccess?: (result: { appointments: WithId<Appointment>[]; slots: WithId<Slot>[] }) => void;
};

export function BookAppointmentForm(props: BookAppointmentFormProps): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const { appointment, onSuccess } = props;

  const bookAppointment = useCallback(
    async (patient: Patient) => {
      setLoading(true);

      // merge patient into participants list
      const booking = {
        ...appointment,
        participant: [
          ...appointment.participant,
          {
            actor: createReference(patient),
            status: 'needs-action',
            required: 'required',
          },
        ],
      } satisfies Appointment;

      // Remove any transient identifiers we added for use in the UI before submitting
      SchedulingTransientIdentifier.remove(booking);

      try {
        const data = await medplum.post<Bundle<WithId<Appointment> | WithId<Slot>>>(
          medplum.fhirUrl('Appointment', '$book'),
          {
            resourceType: 'Parameters',
            parameter: [{ name: 'appointment', resource: booking }],
          }
        );
        medplum.invalidateSearches('Appointment');
        medplum.invalidateSearches('Slot');

        const resources = data.entry?.map((entry) => entry.resource).filter(isDefined) ?? EMPTY;
        const slots = resources.filter(
          (obj: WithId<Slot> | WithId<Appointment>): obj is WithId<Slot> => obj.resourceType === 'Slot'
        );
        const appointments = resources.filter(
          (obj: WithId<Slot> | WithId<Appointment>): obj is WithId<Appointment> => obj.resourceType === 'Appointment'
        );

        onSuccess?.({ appointments, slots });
      } finally {
        setLoading(false);
      }
    },
    [medplum, appointment, onSuccess]
  );

  const handleSubmit = useCallback(async () => {
    if (!patient) {
      return;
    }

    try {
      await bookAppointment(patient);
    } catch (error) {
      showErrorNotification(error);
    }
  }, [patient, bookAppointment]);

  const choosePatient = useCallback((patient: Resource | undefined) => {
    if (patient && patient.resourceType !== 'Patient') {
      throw new Error(`Got unexpected resource type; expected 'Patient', got '${patient.resourceType}'`);
    }
    setPatient(patient);
  }, []);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Text size="lg">{formatPeriod({ start: props.appointment.start, end: props.appointment.end })}</Text>
        <ResourceInput
          label="Patient"
          resourceType="Patient"
          name="Patient-id"
          required={true}
          onChange={choosePatient}
          disabled={loading}
        />

        <Button fullWidth type="submit" loading={loading}>
          Create Appointment
        </Button>
      </Stack>
    </Form>
  );
}
