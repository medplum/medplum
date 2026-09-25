// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Formats a date as the `YYYY-MM-DD` string `@mantine/dates` works in, in local time.
 * @param date - The date to format.
 * @returns The local calendar date.
 */
export function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Reads a `YYYY-MM-DD` month from `MonthPickerButton` as local midnight on the first.
 * @param month - The picked month.
 * @returns The first of that month.
 */
export function parseMonth(month: string): Date {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1);
}
