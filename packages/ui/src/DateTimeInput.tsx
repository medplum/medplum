import React from 'react';
import { Input, InputProps } from './Input';
import './Input.css';

/**
 * The DateTimeInput component is a wrapper around the HTML5 input type="datetime-local".
 * The main purpose is to reconcile time zones.
 * Most of our date/time values are in ISO-8601, which includes a time zone offset.
 * The datetime-local input does not support the time zone offset.
 * @param props The Input props.
 * @returns The JSX element to render.
 */
export function DateTimeInput(props: InputProps): JSX.Element {
  return (
    <Input
      {...props}
      type="datetime-local"
      defaultValue={convertIsoToLocal(props.defaultValue as string | undefined)}
      onChange={(newValue: string) => {
        if (props.onChange) {
          props.onChange(convertLocalToIso(newValue));
        }
      }}
    />
  );
}

function convertIsoToLocal(isoString: string | undefined): string {
  if (!isoString) {
    return '';
  }

  try {
    // Convert the ISO-8601 date to a local datetime-local value.
    // See: https://developer.mozilla.org/en-US/docs/Web/HTML/Date_and_time_formats#local_date_and_time_strings
    // See: https://stackoverflow.com/a/60368477
    const date = new Date(isoString);
    return date.toLocaleDateString('sv') + 'T' + date.toLocaleTimeString('sv');
  } catch (err) {
    // If the input string was malformed, return an empty string.
    return '';
  }
}

function convertLocalToIso(localString: string | undefined): string {
  if (!localString) {
    return '';
  }

  try {
    // Try to parse the local string as a Date
    // JavaScript's Date() constructor defaults to the local time zone.
    // The Date() constructor will throw if the value is malformed.
    return new Date(localString).toISOString();
  } catch (err) {
    // If the input string was malformed, return an empty string.
    return '';
  }
}
