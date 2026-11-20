// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Divider, Stack } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { extractServiceTypeReferences, getSchedulingRequirements, normalizeErrorString } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { BookingRequirementValues } from '../../AppointmentFinder/AppointmentFinder.requirements';
import {
  DEFAULT_DIAGNOSIS_VALUE_SET,
  DEFAULT_PROCEDURE_VALUE_SET,
  hasRequiredValues,
} from '../../AppointmentFinder/AppointmentFinder.requirements';
import { AppointmentNotesInput } from '../../AppointmentFinder/AppointmentNotesInput';
import { BookingRequirementFields } from '../../AppointmentFinder/BookingRequirementFields';
import classes from './AppointmentDetails.module.css';
import { buildAppointmentUpdate, isEdited, readRequirementValues } from './AppointmentDetails.utils';

export interface AppointmentDetailsFormProps {
  readonly appointment: WithId<Appointment>;
  readonly procedureBinding?: string;
  readonly diagnosisBinding?: string;
  /**
   * See {@link AppointmentProposalFormProps.commentMaxLength}. Notes already longer than this
   * have to be shortened before anything can be saved.
   */
  readonly commentMaxLength?: number;
  readonly onUpdated?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /**
   * Controls of the host's own, such as the way back to where the form was opened from.
   * Listed under the save button.
   */
  readonly children?: ReactNode;
}

/**
 * Edits whatever the visit type asked for at booking, and the notes.
 *
 * Fields are filled from the appointment at mount. Saving is a plain update: the time and
 * Slots are untouched.
 *
 * Renders as the details' own children rather than in a box of its own, so its controls
 * take the foot of the details the way theirs do.
 *
 * @param props - The React props.
 * @returns The fields and the buttons saving or leaving them.
 */
export function AppointmentDetailsForm(props: AppointmentDetailsFormProps): JSX.Element {
  const {
    appointment,
    procedureBinding = DEFAULT_PROCEDURE_VALUE_SET,
    diagnosisBinding = DEFAULT_DIAGNOSIS_VALUE_SET,
    commentMaxLength,
    onUpdated,
    children,
  } = props;
  const medplum = useMedplum();

  const service = useResource(extractServiceTypeReferences(appointment.serviceType)[0]);
  const requirements = useMemo(() => getSchedulingRequirements(service), [service]);

  const [values, setValues] = useState<BookingRequirementValues>(() => readRequirementValues(appointment));
  const [comment, setComment] = useState(appointment.comment ?? '');
  const [saving, setSaving] = useState(false);
  // A host still handing over the pre-save appointment would otherwise re-offer the same write.
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();

  const edited = isEdited(appointment, values, requirements) || comment.trim() !== (appointment.comment ?? '');
  const complete = hasRequiredValues(values, requirements);
  const commentTooLong = commentMaxLength !== undefined && comment.trim().length > commentMaxLength;

  function chooseValues(next: BookingRequirementValues): void {
    setValues(next);
    setSaved(false);
  }

  async function save(): Promise<void> {
    if (!complete || commentTooLong) {
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      const updated = await medplum.updateResource({
        ...buildAppointmentUpdate(appointment, values, requirements),
        // FHIR has no empty strings, so cleared notes are left off.
        comment: comment.trim() || undefined,
      });
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
    <>
      <AppointmentNotesInput
        value={comment}
        maxLength={commentMaxLength}
        onChange={(value) => {
          setComment(value);
          setSaved(false);
        }}
      />
      {service && requirements.size > 0 && (
        <BookingRequirementFields
          key={service.id}
          requirements={requirements}
          values={values}
          procedureBinding={procedureBinding}
          diagnosisBinding={diagnosisBinding}
          onChange={chooseValues}
          showValidation
        />
      )}
      <Stack gap="sm" className={classes.actions}>
        <Divider />
        {saveError !== undefined && (
          <Alert color="red" title="Could not save this appointment">
            {normalizeErrorString(saveError)}
          </Alert>
        )}
        <Button
          variant="outline"
          loading={saving}
          disabled={!edited || !complete || commentTooLong || saved}
          onClick={save}
        >
          Save Changes
        </Button>
        {children}
      </Stack>
    </>
  );
}
