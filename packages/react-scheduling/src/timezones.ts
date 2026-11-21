// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtension, TimezoneExtensionURI } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';

// Building an `Intl.DateTimeFormat` costs far more than formatting with one, and a
// stretch of days formats a time for every appointment on it, on every render.
const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Returns a formatter for a set of options, building it the first time it is asked for.
 * @param key - What tells one formatter apart from another.
 * @param options - How to format, read only when the formatter is built.
 * @param locale - The locale to build it in. Defaults to the browser's.
 * @returns The cached formatter.
 */
export function getFormatter(key: string, options: Intl.DateTimeFormatOptions, locale?: string): Intl.DateTimeFormat {
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}

export interface FormatZonedTimeOptions {
  /** Names the zone alongside the time, e.g. "12:30 PM ET". */
  readonly withTimezone?: boolean;
}

/**
 * Formats an instant's time of day in a given timezone (e.g. "12:30 PM").
 * @param date - The instant to format.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @param options - Whether to name the zone as well.
 * @returns The formatted time.
 */
export function formatZonedTime(date: Date, timezone?: string, options?: FormatZonedTimeOptions): string {
  return getFormatter(`time:${timezone ?? ''}${options?.withTimezone ? ':named' : ''}`, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: options?.withTimezone ? TIMEZONE_NAME_STYLE : undefined,
  }).format(date);
}

/**
 * Formats the times a period runs between in a given timezone (e.g. "4:00 PM – 5:00 PM ET"),
 * naming the zone once, after the last time, when it is not the viewer's.
 * @param start - When the period starts.
 * @param end - When it ends, if known.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The formatted times.
 */
export function formatZonedTimeRange(start: Date, end: Date | undefined, timezone?: string): string {
  const withTimezone = !isViewerTimezone(timezone);
  if (!end) {
    return formatZonedTime(start, timezone, { withTimezone });
  }
  return `${formatZonedTime(start, timezone)} – ${formatZonedTime(end, timezone, { withTimezone })}`;
}

/**
 * Formats a calendar day as a heading (e.g. "Monday, July 27").
 * @param date - Local midnight of the day, or with a timezone, any instant during it there.
 * @param timezone - IANA timezone to read the day in. Defaults to the browser's.
 * @returns The formatted day.
 */
export function formatDayHeading(date: Date, timezone?: string): string {
  return getFormatter(`dayHeading:${timezone ?? ''}`, {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * The IANA timezone the browser is set to.
 * @returns The viewer's own timezone identifier.
 */
export function getBrowserTimezone(): string {
  return getFormatter('resolved', {}).resolvedOptions().timeZone;
}

/** Timezone format to display beside a time. */
const TIMEZONE_NAME_STYLE = 'shortGeneric' as const;

/** Arbitrary instant in the browser's timezone. */
const TIMEZONE_LABEL_INSTANT = new Date(0);

/**
 * Names a timezone the short way it is written beside a time, e.g. "ET" or "GMT+2".
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The zone's short name.
 */
export function formatTimezoneLabel(timezone?: string): string {
  const parts = getFormatter(`zoneName:${timezone ?? ''}`, {
    timeZone: timezone,
    timeZoneName: TIMEZONE_NAME_STYLE,
  }).formatToParts(TIMEZONE_LABEL_INSTANT);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

/**
 * Whether a timezone is the viewer's own.
 * @param timezone - IANA timezone the times are in, or undefined when it could not be resolved.
 * @param viewer - The viewer's IANA timezone. Defaults to the browser's
 * @returns True when the zone is the viewer's, or when there is no zone to compare.
 */
export function isViewerTimezone(timezone: string | undefined, viewer?: string): boolean {
  return !timezone || timezone === (viewer ?? getBrowserTimezone());
}

/**
 * Whether the runtime can interpret a timezone identifier. Aliases and unusual casing are accepted, the way
 * scheduling accepts them.
 * @param value - The IANA identifier to test.
 * @returns True when the runtime resolves it.
 */
export function isSupportedTimezone(value: string): boolean {
  try {
    // Constructing the formatter is the check: an identifier the runtime cannot resolve throws here.
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The timezone a resource names for itself, if the runtime can read it. Any producer can write
 * the extension, so a zone the runtime cannot resolve is dropped rather than left to throw.
 * @param resource - The appointment or slot that may name its timezone.
 * @returns The IANA identifier, or undefined when none is named or it cannot be resolved.
 */
export function getOwnTimezone(resource: Pick<Appointment | Slot, 'extension'>): string | undefined {
  const code = getExtension(resource, TimezoneExtensionURI)?.valueCode;
  return code && isSupportedTimezone(code) ? code : undefined;
}
