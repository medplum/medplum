// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text } from '@mantine/core';
import { createReference, EMPTY, formatPeriod, isDefined } from '@medplum/core';
import type { Appointment, Bundle, Patient, Resource, Slot } from '@medplum/fhirtypes';
import { Form, ResourceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

type BookAppointmentFormProps = {
  slot: Slot;
  onSuccess?: (result: { appointments: Appointment[]; slots: Slot[] }) => void;
};

export function BookAppointmentForm(props: BookAppointmentFormProps): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Patient | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);

  const { slot, onSuccess } = props;

  const bookSlot = useCallback(
    async (patient: Patient) => {
      setLoading(true);
      try {
        const data = await medplum.post<Bundle<Appointment | Slot>>(medplum.fhirUrl('Appointment', '$book'), {
          resourceType: 'Parameters',
          parameter: [
            { name: 'slot', resource: slot },
            { name: 'patient-reference', valueReference: createReference(patient) },
          ],
        });
        medplum.invalidateSearches('Appointment');
        medplum.invalidateSearches('Slot');

        const resources = data.entry?.map((entry) => entry.resource).filter(isDefined) ?? EMPTY;
        const slots = resources.filter((obj: Slot | Appointment): obj is Slot => obj.resourceType === 'Slot');
        const appointments = resources.filter(
          (obj: Slot | Appointment): obj is Appointment => obj.resourceType === 'Appointment'
        );

        onSuccess?.({ appointments, slots });
      } finally {
        setLoading(false);
      }
    },
    [medplum, slot, onSuccess]
  );

  const handleSubmit = useCallback(async () => {
    if (!patient) {
      return;
    }
    try {
      await bookSlot(patient);
    } catch (error) {
      showErrorNotification(error);
    }
  }, [patient, bookSlot]);

  const choosePatient = useCallback((patient: Resource | undefined) => {
    if (patient && patient.resourceType !== 'Patient') {
      throw new Error(`Got unexpected resource type; expected 'Patient', got '${patient.resourceType}'`);
    }
    setPatient(patient);
  }, []);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Text size="lg">{formatPeriod({ start: props.slot.start, end: props.slot.end })}</Text>
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
