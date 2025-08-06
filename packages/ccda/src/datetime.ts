// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * C-CDA date/time formats:
 *   1. YYYY
 *   2. YYYYMMDD
 *   3. YYYYMMDDHHMM
 *   4. YYYYMMDDHHMMSS
 *   5. YYYYMMDDHHMM-TZ
 *   6. YYYYMMDDHHMMSS-TZ
 *
 * FHIR date formats:
 *   1. YYYY
 *   2. YYYY-MM-DD
 *
 * FHIR date/time formats:
 *   1. YYYY-MM-DDTHH:MM:SS-TZ
 */

/**
 * Map the C-CDA date to the FHIR date.
 * @param date - The C-CDA date.
 * @returns The FHIR date.
 */
export function mapCcdaToFhirDate(date: string | undefined): string | undefined {
  if (!date) {
    return undefined;
  }

  const year = date.substring(0, 4);
  let month = '01';
  let day = '01';

  if (date.length >= 8) {
    month = date.substring(4, 6);
    day = date.substring(6, 8);
  }

  return `${year}-${month}-${day}`;
}

/**
 * Map the C-CDA date time to the FHIR date time.
 * @param dateTime - The C-CDA date time.
 * @returns The FHIR date time.
 */
export function mapCcdaToFhirDateTime(dateTime: string | undefined): string | undefined {
  if (!dateTime) {
    return undefined;
  }

  const year = dateTime.substring(0, 4);
  let month = '01';
  let day = '01';
  let hour = '00';
  let minute = '00';
  let second = '00';
  let tz = 'Z';

  if (dateTime.length >= 8) {
    month = dateTime.substring(4, 6);
    day = dateTime.substring(6, 8);
  }

  if (dateTime.length >= 12) {
    hour = dateTime.substring(8, 10);
    minute = dateTime.substring(10, 12);
  }

  if (dateTime.length >= 14) {
    second = dateTime.substring(12, 14);
  }

  if (dateTime.length > 14) {
    tz = dateTime.substring(14);
    if (tz === '+0000') {
      tz = 'Z';
    }
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${tz}`;
}

/**
 * Map the FHIR date to the C-CDA date.
 * @param date - The FHIR date.
 * @returns The C-CDA date.
 */
export function mapFhirToCcdaDate(date: string | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.substring(0, 10).replace(/-/g, '');
}

/**
 * Map the FHIR date time to the C-CDA date time.
 * @param dateTime - The FHIR date time.
 * @returns The C-CDA date time.
 */
export function mapFhirToCcdaDateTime(dateTime: string | undefined): string | undefined {
  if (!dateTime) {
    return undefined;
  }

  const [date, time] = dateTime.split('T');

  const outDate = date.replaceAll('-', ''); // Remove dashes

  const outTime = (time ?? '')
    .replaceAll(/\.\d+/g, '') // Remove decimal point seconds
    .replaceAll(/:/g, '') // Remove colons
    .replaceAll(/Z/g, '+0000'); // Replace Z with +0000

  return `${outDate}${outTime}`;
}
