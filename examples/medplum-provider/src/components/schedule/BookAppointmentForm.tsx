// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  createReference,
  EMPTY,
  formatPeriod,
  getExtensionValue,
  isCoding,
  isDefined,
  isReference,
} from '@medplum/core';
import type {
  Appointment,
  Bundle,
  Encounter,
  HealthcareService,
  Patient,
  PlanDefinition,
  Practitioner,
  Slot,
} from '@medplum/fhirtypes';
import { Form, ResourceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { createEncounter } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import {
  SchedulingEncounterCodingURI,
  SchedulingPlanDefinitionURI,
  SchedulingTransientIdentifier,
} from '../../utils/scheduling';

type BookAppointmentFormProps = {
  appointment: Appointment;
  healthcareService: HealthcareService;
  onSuccess?: (result: {
    appointment: WithId<Appointment>;
    slots: WithId<Slot>[];
    patient: WithId<Patient>;
    encounter: WithId<Encounter> | undefined;
  }) => void | Promise<void>;
};

export function BookAppointmentForm(props: BookAppointmentFormProps): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<WithId<Patient> | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const { appointment, healthcareService, onSuccess } = props;

  const bookEncounter = useCallback(
    async (appointment: WithId<Appointment>): Promise<WithId<Encounter> | undefined> => {
      // If the HealthcareService we are booking with respect to has extensions holding the
      // configuration needed to create an Encounter for this booking, we try to create the
      // encounter now.
      const planDefinitionRef = getExtensionValue(healthcareService, SchedulingPlanDefinitionURI);
      const encounterClass = getExtensionValue(healthcareService, SchedulingEncounterCodingURI);
      const practitioners = appointment.participant
        .map((p) => p.actor)
        .filter((actor) => isReference<Practitioner>(actor, 'Practitioner'));
      const patients = appointment.participant
        .map((p) => p.actor)
        .filter((actor) => isReference<Patient>(actor, 'Patient'));

      if (!isReference<PlanDefinition>(planDefinitionRef, 'PlanDefinition')) {
        return undefined;
      }

      if (!isCoding(encounterClass)) {
        return undefined;
      }

      // When creating an encounter, we want to call `PlanDefinition/:id/$apply`
      // with exactly one practitioner. If we don't have an unambiguous choice
      // here, instead of guessing we skip encounter creation. The viewer can
      // set up the encounter themselves later.
      const practitioner = practitioners[0];
      if (!practitioner || practitioners.length > 1) {
        return undefined;
      }

      // Medplum Server's `PlanDefinition/:id/$apply` operation only handles a
      // single patient in the `subject` parameter at this time. If there is
      // not exactly one patient in the appointment, skip encounter creation.
      const patient = patients[0];
      if (!patient || patients.length > 1) {
        return undefined;
      }

      const planDefinition = await medplum.readReference(planDefinitionRef);

      return createEncounter(medplum, encounterClass, patient, planDefinition, appointment, practitioner);
    },
    [medplum, healthcareService]
  );

  const bookAppointment = useCallback(
    async (patient: WithId<Patient>) => {
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
        const appointment = resources.find(
          (obj: WithId<Slot> | WithId<Appointment>): obj is WithId<Appointment> => obj.resourceType === 'Appointment'
        );

        if (appointment) {
          let encounter: WithId<Encounter> | undefined;
          try {
            encounter = await bookEncounter(appointment);
          } catch (err) {
            // If we couldn't load the plan definition or create the encounter for
            // some reason, we log the error but ignore it. The viewer can decide how
            // to proceed and manually create the encounter.
            console.error(err);
          }
          await onSuccess?.({ appointment, slots, patient, encounter });
        }
      } finally {
        setLoading(false);
      }
    },
    [medplum, appointment, bookEncounter, onSuccess]
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

  const choosePatient = useCallback((patient: WithId<Patient> | undefined) => {
    setPatient(patient);
  }, []);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Text size="lg">{formatPeriod({ start: props.appointment.start, end: props.appointment.end })}</Text>
        <ResourceInput<WithId<Patient>>
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
