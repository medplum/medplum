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
 * A day picked out of a month of open weekdays.
 *
 * Days with times on them are filled; the rest are drawn as empty and cannot be
 * clicked at all.
 * @returns The story.
 */
export const Basic = (): JSX.Element => {
  const [selected, setSelected] = useState<Date>();
  return (
    <Document>
      <CalendarDateInput
        availableDates={weekdaysOfMonth()}
        selected={selected}
        onChangeMonth={(date: Date) => console.log(date)}
        onClick={setSelected}
      />
    </Document>
  );
};

// Every weekday of the month has times on it, which is what the filled days say.
// The rest are drawn as empty, and here cannot be clicked at all.
export const MonthOfAvailability = (): JSX.Element => (
  <Document>
    <CalendarDateInput
      availableDates={weekdaysOfMonth()}
      selected={weekdaysOfMonth()[2]}
      onChangeMonth={(date: Date) => console.log(date)}
      onClick={(date: Date) => console.log('Clicked ' + date)}
    />
  </Document>
);

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

/**
 * A calendar that can be asked about a day with nothing on it.
 *
 * Empty days stay marked as having nothing on offer but remain clickable, which
 * is what a caller wants when it can still do something with the day — take a
 * request for a specific time, say, or run a fresh search over it.
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
 *
 * Days before the earliest one are closed off even though the rest of the month
 * is open, and the calendar will not page back past the month holding it. A day
 * that has passed is a different kind of empty from a day with nothing booked on
 * it: there is nothing to ask for and no request to make.
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
 *
 * Passing `month` hands it over: the calendar then shows what it is given and
 * moves only when `onChangeMonth` is answered.
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
