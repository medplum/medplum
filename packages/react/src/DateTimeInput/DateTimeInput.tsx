import { TextInput } from '@mantine/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { ChangeEvent } from 'react';
import { getErrorsForInput } from '../utils/outcomes';
import { convertIsoToLocal, convertLocalToIso } from './DateTimeInput.utils';
import { PrimitiveTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export interface DateTimeInputProps extends PrimitiveTypeInputProps {
  readonly label?: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly autoFocus?: boolean;
  readonly outcome?: OperationOutcome;
  readonly onChange?: (value: string) => void;
}

/**
 * The DateTimeInput component is a wrapper around the HTML5 input type="datetime-local".
 * The main purpose is to reconcile time zones.
 * Most of our date/time values are in ISO-8601, which includes a time zone offset.
 * The datetime-local input does not support the time zone offset.
 * @param props - The Input props.
 * @returns The JSX element to render.
 */
export function DateTimeInput(props: DateTimeInputProps): JSX.Element {
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
      type={getInputType()}
      defaultValue={convertIsoToLocal(props.defaultValue)}
      autoFocus={props.autoFocus}
      error={getErrorsForInput(props.outcome, props.name)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        if (props.onChange) {
          const newValue = e.currentTarget.value;
          props.onChange(convertLocalToIso(newValue));
        }
      }}
    />
  );
}

/**
 * Returns the input type for the requested type.
 * JSDOM does not support many of the valid <input> type attributes.
 * For example, it won't fire change events for <input type="datetime-local">.
 * @returns The input type for the current environment.
 */
function getInputType(): string {
  return import.meta.env.NODE_ENV === 'test' ? 'text' : 'datetime-local';
}
