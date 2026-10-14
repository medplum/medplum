// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Period } from '@medplum/fhirtypes';
import type { CcdaEffectiveTime } from './types';

/*
 * C-CDA date/time formats:
 *   1. YYYY
 *   2. YYYYMM
 *   3. YYYYMMDD
 *   4. YYYYMMDDHH[MM[SS[.fraction]]]
 *   5. Timezone offset (±HHMM) may follow the time
 *
 * FHIR date formats:
 *   1. YYYY
 *   2. YYYY-MM
 *   3. YYYY-MM-DD
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
  if (date.length < 6) {
    return year;
  }
  const month = date.substring(4, 6);
  if (date.length < 8) {
    return `${year}-${month}`;
  }
  return `${year}-${month}-${date.substring(6, 8)}`;
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

  const timezoneMatch = /([+-]\d{4})$/.exec(dateTime);
  const tz = timezoneMatch?.[1];
  const value = tz ? dateTime.substring(0, dateTime.length - tz.length) : dateTime;
  const fractionMatch = /\.(\d+)$/.exec(value);
  const fraction = fractionMatch?.[1];
  const dateAndTime = fractionMatch ? value.substring(0, value.length - fractionMatch[0].length) : value;

  const year = dateAndTime.substring(0, 4);
  if (dateAndTime.length < 6) {
    return year;
  }
  const month = dateAndTime.substring(4, 6);
  if (dateAndTime.length < 8) {
    return `${year}-${month}`;
  }

  const date = `${year}-${month}-${dateAndTime.substring(6, 8)}`;
  if (dateAndTime.length < 10) {
    return date;
  }

  const hour = dateAndTime.substring(8, 10);
  const minute = dateAndTime.length >= 12 ? dateAndTime.substring(10, 12) : '00';
  const second = dateAndTime.length >= 14 ? dateAndTime.substring(12, 14) : '00';
  let timezone = tz ?? 'Z';
  if (timezone === '+0000' || timezone === '-0000') {
    timezone = 'Z';
  } else if (tz) {
    timezone = `${timezone.substring(0, 3)}:${timezone.substring(3)}`;
  }

  const fractionalSeconds = fraction ? `.${fraction}` : '';
  return `${date}T${hour}:${minute}:${second}${fractionalSeconds}${timezone}`;
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
  return date.substring(0, 10).replaceAll('-', '');
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
    .replaceAll(':', '') // Remove colons
    .replaceAll('Z', '+0000'); // Replace Z with +0000

  return `${outDate}${outTime}`;
}

export function mapFhirPeriodOrDateTimeToCcda(
  period: Period | undefined,
  dateTime: string | undefined
): CcdaEffectiveTime {
  if (period?.start || period?.end) {
    const effectiveTime: CcdaEffectiveTime = {};
    if (period.start) {
      effectiveTime.low = { '@_value': mapFhirToCcdaDateTime(period.start) ?? '' };
    }
    if (period.end) {
      effectiveTime.high = { '@_value': mapFhirToCcdaDateTime(period.end) ?? '' };
    }
    return effectiveTime;
  }
  if (dateTime) {
    return { '@_value': mapFhirToCcdaDateTime(dateTime) ?? '' };
  }
  return {};
}
