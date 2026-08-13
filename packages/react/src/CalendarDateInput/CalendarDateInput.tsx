// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group } from '@mantine/core';
import cx from 'clsx';
import type { JSX, MouseEvent } from 'react';
import { useMemo, useState } from 'react';
import classes from './CalendarDateInput.module.css';
import type { DateRange } from './CalendarDateInput.utils';
import {
  getMonthString,
  getRangeAnchor,
  getStartMonth,
  isBeforeDay,
  isSameDay,
  isSelectedDay,
  isWithinDateRange,
  startOfMonth,
  toDateRange,
} from './CalendarDateInput.utils';

export type { DateRange } from './CalendarDateInput.utils';

export interface CalendarDateInputProps {
  readonly availableDates: Date[];
  readonly onChangeMonth: (date: Date) => void;
  readonly onClick: (date: Date) => void;
  /**
   * Called with the selection a click leaves behind, for callers holding
   * `selected`. A plain click reports the day on its own; a shift-click reports
   * the range swept from the current selection when `allowDateRange` is set.
   */
  readonly onChangeSelected?: (selected: Date | DateRange) => void;
  readonly month?: Date;
  readonly selected?: Date | DateRange;
  /** Lets shift-click sweep a range of days out from the selected one. */
  readonly allowDateRange?: boolean;
  readonly allowUnavailableDates?: boolean;
  readonly earliestDate?: Date;
}

interface CalendarCell {
  readonly date: Date;
  readonly available: boolean;
}

type OptionalCalendarCell = CalendarCell | undefined;

export function CalendarDateInput(props: CalendarDateInputProps): JSX.Element {
  const { onChangeMonth, onClick, onChangeSelected, selected, allowDateRange, allowUnavailableDates, earliestDate } =
    props;
  const [uncontrolledMonth, setUncontrolledMonth] = useState<Date>(getStartMonth);
  const shownMonth = props.month ?? uncontrolledMonth;
  const year = shownMonth.getFullYear();
  const monthIndex = shownMonth.getMonth();
  const month = useMemo(() => new Date(year, monthIndex, 1), [year, monthIndex]);
  const atEarliestMonth = !!earliestDate && month <= startOfMonth(earliestDate);

  function moveMonth(delta: number): void {
    const newMonth = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    if (props.month === undefined) {
      setUncontrolledMonth(newMonth);
    }
    onChangeMonth(newMonth);
  }

  function isDayDisabled(day: CalendarCell): boolean {
    return (!day.available && !allowUnavailableDates) || (!!earliestDate && isBeforeDay(day.date, earliestDate));
  }

  function handleDayClick(date: Date, event: MouseEvent<HTMLButtonElement>): void {
    onClick(date);
    if (!onChangeSelected) {
      return;
    }
    const anchor = allowDateRange && event.shiftKey ? getRangeAnchor(selected) : undefined;
    onChangeSelected(anchor ? toDateRange(anchor, date) : date);
  }

  const grid = useMemo(() => buildGrid(month, props.availableDates), [month, props.availableDates]);

  return (
    <div>
      <Group justify="space-between" gap="xs" grow wrap="nowrap">
        <p style={{ flex: 1 }}>{getMonthString(month)}</p>
        <Group justify="flex-end" gap="xs">
          <Button
            variant="outline"
            aria-label="Previous month"
            disabled={atEarliestMonth}
            onClick={() => moveMonth(-1)}
          >
            &lt;
          </Button>
          <Button variant="outline" aria-label="Next month" onClick={() => moveMonth(1)}>
            &gt;
          </Button>
        </Group>
      </Group>
      <table className={classes.table}>
        <thead>
          <tr>
            <th>SUN</th>
            <th>MON</th>
            <th>TUE</th>
            <th>WED</th>
            <th>THU</th>
            <th>FRI</th>
            <th>SAT</th>
          </tr>
        </thead>
        <tbody>
          {grid.map((week, weekIndex) => (
            <tr key={'week-' + weekIndex}>
              {week.map((day, dayIndex) => {
                const picked = !!day && isSelectedDay(day.date, selected);
                const spanned = !!day && isWithinDateRange(day.date, selected);
                return (
                  <td key={'day-' + dayIndex}>
                    {day && (
                      <Button
                        variant="light"
                        className={cx(
                          day.available && classes.available,
                          spanned && classes.withinRange,
                          picked && classes.selected
                        )}
                        aria-pressed={selected ? picked || spanned : undefined}
                        disabled={isDayDisabled(day)}
                        onClick={(event) => handleDayClick(day.date, event)}
                      >
                        {day.date.getDate()}
                      </Button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildGrid(startDate: Date, availableDates: Date[]): OptionalCalendarCell[][] {
  const d = new Date(startDate.getFullYear(), startDate.getMonth());
  const grid: OptionalCalendarCell[][] = [];
  let row: OptionalCalendarCell[] = [];

  // Fill leading empty days
  for (let i = 0; i < d.getDay(); i++) {
    row.push(undefined);
  }

  while (d.getMonth() === startDate.getMonth()) {
    row.push({
      date: new Date(d),
      available: isDayAvailable(d, availableDates),
    });

    if (d.getDay() === 6) {
      grid.push(row);
      row = [];
    }

    d.setDate(d.getDate() + 1);
  }

  // Fill trailing empty days
  if (d.getDay() !== 0) {
    for (let i = d.getDay(); i < 7; i++) {
      row.push(undefined);
    }
    grid.push(row);
  }

  return grid;
}

/**
 * Returns true if the given date is available for booking.
 * @param day - The day to check.
 * @param availableDates - The list of available dates.
 * @returns True if there are any available slots for the day.
 */
function isDayAvailable(day: Date, availableDates: Date[]): boolean {
  // Note that slot start and end time may or may not be in UTC.
  return availableDates.some((availableDate) => isSameDay(availableDate, day));
}
