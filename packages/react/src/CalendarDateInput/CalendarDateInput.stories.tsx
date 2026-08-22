// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { Document } from '../Document/Document';
import { withMockedDate } from '../stories/decorators';
import { CalendarDateInput } from './CalendarDateInput';

export default {
  title: 'Medplum/CalendarDateInput',
  component: CalendarDateInput,
  decorators: [withMockedDate],
} as Meta;

/**
 * A month of open weekdays.
 * @returns The story.
 */
export const Basic = (): JSX.Element => (
  <Document>
    <CalendarDateInput
      availableDates={weekdaysOfMonth()}
      onChangeMonth={(date: Date) => console.log(date)}
      onClick={(date: Date) => console.log('Clicked ' + date)}
    />
  </Document>
);

/**
 * The day chosen, marked out of the days on offer.
 * @returns The story.
 */
export const SelectedDay = (): JSX.Element => {
  const weekdays = weekdaysOfMonth();
  return (
    <Document>
      <CalendarDateInput
        availableDates={weekdays}
        selected={weekdays[2]}
        onChangeMonth={(date: Date) => console.log(date)}
        onClick={(date: Date) => console.log('Clicked ' + date)}
      />
    </Document>
  );
};

/**
 * A clinic with only a few days open, which is what most months actually look
 * like once a schedule has been searched.
 * @returns The story.
 */
export const SparseAvailability = (): JSX.Element => {
  const [selected, setSelected] = useState<Date>();
  return (
    <Document>
      <CalendarDateInput
        availableDates={someDaysOfMonth([6, 7, 13, 20, 21, 27])}
        selected={selected}
        onChangeMonth={(date: Date) => console.log(date)}
        onClick={setSelected}
      />
    </Document>
  );
};

// A stretch of days, banded across the weeks it spans with both of its ends
// marked. Drag across the days, or shift-click, to ask for another.
export const Range = (): JSX.Element => {
  const [range, setRange] = useState({ start: weekdaysOfMonth()[2], end: weekdaysOfMonth()[8] });
  return (
    <Document>
      <CalendarDateInput
        availableDates={weekdaysOfMonth()}
        range={range}
        allowUnavailableDates
        onChangeMonth={(date: Date) => console.log(date)}
        onClick={(date: Date) => setRange({ start: date, end: date })}
        onSelectRange={(start: Date, end: Date) => setRange({ start, end })}
      />
    </Document>
  );
};

/**
 * A calendar that can be asked about a day with nothing on it.
 * @returns The story.
 */
export const EmptyDaysStillPickable = (): JSX.Element => {
  const [selected, setSelected] = useState<Date>();
  return (
    <Document>
      <CalendarDateInput
        availableDates={someDaysOfMonth([6, 7, 13, 20, 21, 27])}
        selected={selected}
        allowUnavailableDates
        onChangeMonth={(date: Date) => console.log(date)}
        onClick={setSelected}
      />
    </Document>
  );
};

/**
 * A service that needs two days' notice.
 * @returns The story.
 */
export const EarliestDay = (): JSX.Element => {
  const [selected, setSelected] = useState<Date>();
  const now = new Date();
  const earliest = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  return (
    <Document>
      <CalendarDateInput
        availableDates={weekdaysOfMonth()}
        selected={selected}
        earliestDate={earliest}
        allowUnavailableDates
        onChangeMonth={(date: Date) => console.log(date)}
        onClick={setSelected}
      />
    </Document>
  );
};

/**
 * The month held outside the calendar, as a host paging its own search would.
 * @returns The story.
 */
export const CallerOwnedMonth = (): JSX.Element => {
  const [month, setMonth] = useState(new Date());
  return (
    <Document>
      <Text size="sm" c="dimmed" mb="md">
        Showing {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </Text>
      <CalendarDateInput
        availableDates={weekdaysOfMonth(month)}
        month={month}
        onChangeMonth={setMonth}
        onClick={(date: Date) => console.log('Clicked ' + date)}
      />
    </Document>
  );
};

/**
 * Returns every weekday of a month.
 * @param month - Any day of the month to read. Defaults to the month on display.
 * @returns Local midnight of each weekday.
 */
function weekdaysOfMonth(month?: Date): Date[] {
  const now = month ?? new Date();
  const days: Date[] = [];
  for (let day = 1; day <= 31; day++) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    if (date.getMonth() === now.getMonth() && date.getDay() !== 0 && date.getDay() !== 6) {
      days.push(date);
    }
  }
  return days;
}

/**
 * Returns the named days of the month on display.
 * @param days - Days of the month, as numbers.
 * @returns Local midnight of each one that the month holds.
 */
function someDaysOfMonth(days: readonly number[]): Date[] {
  const now = new Date();
  return days
    .map((day) => new Date(now.getFullYear(), now.getMonth(), day))
    .filter((date) => date.getMonth() === now.getMonth());
}
