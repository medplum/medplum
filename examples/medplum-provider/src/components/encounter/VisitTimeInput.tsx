// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TextInput } from '@mantine/core';
import { convertIsoToLocal, convertLocalToIso } from '@medplum/react';
import type { JSX } from 'react';

export interface VisitTimeInputProps {
  readonly name: string;
  readonly label: string;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}

/**
 * A visit's check-in or check-out time, to the minute. Like DateTimeInput, but without seconds.
 * @param props - The VisitTimeInput React props.
 * @returns The input.
 */
export function VisitTimeInput(props: VisitTimeInputProps): JSX.Element {
  return (
    <TextInput
      id={props.name}
      name={props.name}
      label={props.label}
      disabled={props.disabled}
      // JSDOM doesn't fire change events for datetime-local inputs.
      type={import.meta.env.NODE_ENV === 'test' ? 'text' : 'datetime-local'}
      step={60}
      // The local value is "YYYY-MM-DDTHH:mm:ss"; dropping the seconds hides them in the input.
      defaultValue={convertIsoToLocal(props.defaultValue).slice(0, 16)}
      onChange={(e) => props.onChange(convertLocalToIso(e.currentTarget.value))}
    />
  );
}
