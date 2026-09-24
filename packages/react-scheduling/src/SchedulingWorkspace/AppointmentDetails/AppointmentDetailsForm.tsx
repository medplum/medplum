// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  createReference,
  extractServiceTypeReferences,
  getSchedulingRequirements,
  normalizeErrorString,
} from '@medplum/core';
import type { Appointment, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { BookingRequirementValues } from '../../AppointmentFinder/AppointmentFinder.requirements';
import {
  DEFAULT_DIAGNOSIS_VALUE_SET,
  DEFAULT_PROCEDURE_VALUE_SET,
  hasRequiredValues,
} from '../../AppointmentFinder/AppointmentFinder.requirements';
import { AppointmentPatientInput } from '../../AppointmentFinder/AppointmentPatientInput';
import { BookingRequirementFields } from '../../AppointmentFinder/BookingRequirementFields';
import {
  buildAppointmentUpdate,
  getPatientParticipant,
  isEdited,
  readRequirementValues,
} from './AppointmentDetails.utils';

export interface AppointmentDetailsFormProps {
  readonly appointment: WithId<Appointment>;
  readonly procedureBinding?: string;
  readonly diagnosisBinding?: string;
  readonly onUpdated?: (appointment: WithId<Appointment>) => void | Promise<void>;
}

/**
 * Edits the patient, and whatever the visit type asked for at booking.
 *
 * Fields are filled from the appointment at mount. Saving is a plain update: the time and
 * Slots are untouched.
 *
 * @param props - The React props.
 * @returns The fields and the button saving them.
 */
export function AppointmentDetailsForm(props: AppointmentDetailsFormProps): JSX.Element {
  const {
    appointment,
    procedureBinding = DEFAULT_PROCEDURE_VALUE_SET,
    diagnosisBinding = DEFAULT_DIAGNOSIS_VALUE_SET,
    onUpdated,
  } = props;
  const medplum = useMedplum();

  const service = useResource(extractServiceTypeReferences(appointment.serviceType)[0]);
  const requirements = useMemo(() => getSchedulingRequirements(service), [service]);

  const [patient, setPatient] = useState<Reference<Patient> | undefined>(
    () => getPatientParticipant(appointment)?.actor as Reference<Patient> | undefined
  );
  const [values, setValues] = useState<BookingRequirementValues>(() => readRequirementValues(appointment));
  const [saving, setSaving] = useState(false);
  // A host still handing over the pre-save appointment would otherwise re-offer the same write.
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();

  const edited = isEdited(appointment, patient, values, requirements);
  const complete = patient !== undefined && hasRequiredValues(values, requirements);

  function choosePatient(next: WithId<Patient> | undefined): void {
    setPatient(next && createReference(next));
    setSaved(false);
  }

  function chooseValues(next: BookingRequirementValues): void {
    setValues(next);
    setSaved(false);
  }

  async function save(): Promise<void> {
    if (!patient) {
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      const updated = await medplum.updateResource(buildAppointmentUpdate(appointment, patient, values, requirements));
      setSaved(true);
      try {
        await onUpdated?.(updated);
      } catch (error) {
        console.error(error);
      }
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="sm">
      <AppointmentPatientInput defaultValue={patient} onChange={choosePatient} />
      {service && requirements.size > 0 && (
        <BookingRequirementFields
          key={service.id}
          requirements={requirements}
          values={values}
          procedureBinding={procedureBinding}
          diagnosisBinding={diagnosisBinding}
          onChange={chooseValues}
        />
      )}
      {saveError !== undefined && (
        <Alert color="red" title="Could not save this appointment">
          {normalizeErrorString(saveError)}
        </Alert>
      )}
      <Button variant="outline" loading={saving} disabled={!edited || !complete || saved} onClick={save}>
        Save Changes
      </Button>
    </Stack>
  );
}
