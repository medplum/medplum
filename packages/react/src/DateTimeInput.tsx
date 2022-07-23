import { isValidDate } from '@medplum/core';
import React from 'react';
import { Input, InputProps } from './Input';

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
