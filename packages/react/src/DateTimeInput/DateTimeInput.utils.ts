import { isValidDate } from '@medplum/core';

/**
 * Converts an ISO-8601 date/time string to a local date/time string.
 * @param isoString - The ISO-8601 date/time string to convert.
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
 * @param localString - The local date/time string to convert.
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
