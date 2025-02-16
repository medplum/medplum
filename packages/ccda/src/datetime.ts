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

  // Use the "RegExp.exec()" method instead.
  const matches = /(\d{4})(\d{2})?(\d{2})?/.exec(date);
  if (!matches) {
    return undefined;
  }

  const [_, year, month, day] = matches;
  return `${year}-${month ?? '01'}-${day ?? '01'}`;
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

  const matches = /(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([-+]\d{2}:?\d{2}|Z)?/.exec(dateTime);
  if (!matches) {
    return undefined;
  }

  const [_, year, month, day, hour, minute, second, tz] = matches;
  return `${year}-${month ?? '01'}-${day ?? '01'}T${hour ?? '00'}:${minute ?? '00'}:${second ?? '00'}${tz ?? 'Z'}`;
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
