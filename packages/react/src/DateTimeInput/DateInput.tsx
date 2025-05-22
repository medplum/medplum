import { TextInput } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { ChangeEvent } from 'react';
import { PrimitiveTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { getErrorsForInput } from '../utils/outcomes';
import { convertIsoToLocal, convertLocalToIso } from './DateTimeInput.utils';

export interface DateInputProps extends PrimitiveTypeInputProps {
  readonly label?: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly autoFocus?: boolean;
  readonly outcome?: OperationOutcome;
  readonly onChange?: (value: string) => void;
}

/**
 * The DateInput component is a wrapper around the HTML5 input type="date".
 * The main purpose is to reconcile time zones.
 * Most of our date values are in ISO-8601, which includes a time zone offset.
 * The date input does not support the time zone offset.
 * @param props - The Input props.
 * @returns The JSX element to render.
 */
export function DateInput(props: DateInputProps): JSX.Element {
  return (
    <TextInput
      id={props.name}
      name={props.name}
      label={props.label}
      data-autofocus={props.autoFocus}
      data-testid={props['data-testid'] ?? props.name}
      placeholder={props.placeholder}
      required={props.required}
      disabled={props.disabled}
      type="date"
      defaultValue={convertIsoToLocal(props.defaultValue)?.split('T')[0]}
      autoFocus={props.autoFocus}
      error={getErrorsForInput(props.outcome, props.name)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        if (props.onChange) {
          const newValue = e.currentTarget.value;
          props.onChange(convertLocalToIso(newValue + 'T00:00:00'));
        }
      }}
    />
  );
} 