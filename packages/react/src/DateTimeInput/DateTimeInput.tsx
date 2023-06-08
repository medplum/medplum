import { TextInput } from '@mantine/core';
import { isValidDate } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import React from 'react';
import { getErrorsForInput } from '../utils/outcomes';

export interface DateTimeInputProps {
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  outcome?: OperationOutcome;
  onChange?: (value: string) => void;
}

/**
 * The DateTimeInput component is a wrapper around the HTML5 input type="datetime-local".
 * The main purpose is to reconcile time zones.
 * Most of our date/time values are in ISO-8601, which includes a time zone offset.
 * The datetime-local input does not support the time zone offset.
 * @param props The Input props.
 * @returns The JSX element to render.
 */
export function DateTimeInput(props: DateTimeInputProps): JSX.Element {
  return (
    <TextInput
      id={props.name}
      name={props.name}
      data-testid={props.name}
      placeholder={props.placeholder}
      required={props.required}
      type={getInputType()}
      defaultValue={convertIsoToLocal(props.defaultValue)}
      error={getErrorsForInput(props.outcome, props.name)}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        if (props.onChange) {
          const newValue = e.currentTarget.value;
          props.onChange(convertLocalToIso(newValue));
        }
      }}
    />
  );
}

/**
 * Converts an ISO-8601 date/time string to a local date/time string.
 * @param isoString The ISO-8601 date/time string to convert.
 * @returns The local date/time string.
 */
export function convertIsoToLocal(isoString: string | undefined): string {
  if (!isoString) {
    return '';
  }

  // Convert the ISO-8601 date to a local datetime-local value.
  // See: https://developer.mozilla.org/en-US/docs/Web/HTML/Date_and_time_formats#local_date_and_time_strings
  // See: https://stackoverflow.com/a/60368477
  const date = new Date(isoString);
  if (!isValidDate(date)) {
    // If the input string was malformed, return an empty string.
    return '';
  }

  return date.toLocaleDateString('sv') + 'T' + date.toLocaleTimeString('sv');
}

/**
 * Converts a local date/time string to an ISO-8601 date/time string.
 * @param localString The local date/time string to convert.
 * @returns The ISO-8601 date/time string.
 */
export function convertLocalToIso(localString: string | undefined): string {
  if (!localString) {
    return '';
  }

  // Try to parse the local string as a Date
  // JavaScript's Date() constructor defaults to the local time zone.
  // The Date() constructor will throw if the value is malformed.
  const date = new Date(localString);
  if (!isValidDate(date)) {
    // If the input string was malformed, return an empty string.
    return '';
  }

  return date.toISOString();
}

/**
 * Returns the input type for the requested type.
 * JSDOM does not support many of the valid <input> type attributes.
 * For example, it won't fire change events for <input type="datetime-local">.
 * @returns The input type for the current environment.
 */
function getInputType(): string {
  return process.env.NODE_ENV === 'test' ? 'text' : 'datetime-local';
}
