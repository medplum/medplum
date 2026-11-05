// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Textarea } from '@mantine/core';
import type { JSX } from 'react';
import classes from './AppointmentFinder.module.css';

export interface AppointmentNotesInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Counted as typed. Notes already longer are shown as an error rather than cut short. */
  readonly maxLength?: number;
}

/**
 * The notes (`Appointment.comment`) field, counting them against a cap when there is one.
 *
 * @param props - The React props.
 * @returns The field.
 */
export function AppointmentNotesInput(props: AppointmentNotesInputProps): JSX.Element {
  const { value, onChange, maxLength } = props;
  const tooLong = maxLength !== undefined && value.length > maxLength;
  return (
    <Textarea
      label="Notes"
      autosize
      minRows={2}
      maxLength={maxLength}
      // The count is the description, not part of the label, so it is announced with the
      // field without becoming part of its name.
      description={maxLength !== undefined && `${value.length}/${maxLength}`}
      error={tooLong && `Notes are limited to ${maxLength} characters.`}
      inputWrapperOrder={['label', 'description', 'input', 'error']}
      classNames={{
        root: classes.notes,
        description: tooLong ? classes.notesCountOver : undefined,
        wrapper: classes.notesField,
        error: classes.notesField,
      }}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
