// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group } from '@mantine/core';
import cx from 'clsx';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import classes from './CalendarDateInput.module.css';
import { getMonthString, getStartMonth, isBeforeDay, isSameDay, startOfMonth } from './CalendarDateInput.utils';

export interface CalendarDateInputProps {
  readonly availableDates: Date[];
  readonly onChangeMonth: (date: Date) => void;
  readonly onClick: (date: Date) => void;
  /** The month on display. When provided the caller owns the month, and `onChangeMonth` is the only way it changes. */
  readonly month?: Date;
  /** The day to mark as chosen. */
  readonly selected?: Date;
  /**
   * Whether days with no available times can still be chosen.
   *
   * `availableDates` otherwise does two jobs at once: it says which days are
   * drawn as having times on them, and it closes off the ones that do not. This
   * separates them, leaving empty days marked as empty but clickable.
   *
   * Use it when the caller can do something with an empty day, such as taking a
   * request for a specific time on it.
   */
  readonly allowUnavailableDates?: boolean;
  /**
   * The first day worth asking about. Earlier days cannot be picked and the
   * calendar will not page back past the month holding it.
   *
   * A day that has passed is a different kind of empty from a day with nothing
   * booked on it: there is nothing to ask for and no request to make, so it is
   * closed off even where `allowUnavailableDates` opens up the rest.
   */
  readonly earliestDate?: Date;
}

interface CalendarCell {
  readonly date: Date;
  readonly available: boolean;
}

type OptionalCalendarCell = CalendarCell | undefined;

export function CalendarDateInput(props: CalendarDateInputProps): JSX.Element {
  const { onChangeMonth, onClick, selected, allowUnavailableDates, earliestDate } = props;
  const [uncontrolledMonth, setUncontrolledMonth] = useState<Date>(getStartMonth);
  // Normalized to the first, since a caller may name the month by any day in it —
  // the day its user picked, say — and both paging and the earliest-day bound
  // compare months rather than days.
  const month = startOfMonth(props.month ?? uncontrolledMonth);

  function moveMonth(delta: number): void {
    // Counted in months from the first, rather than by moving the month of a
    // date that may be a 31st: stepping to a shorter month would roll that day
    // over into the month after it and skip one.
    const newMonth = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setUncontrolledMonth(newMonth);
    onChangeMonth(newMonth);
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
            // Months entirely in the past hold nothing to book, so the way back
            // stops at the one the earliest day falls in.
            disabled={!!earliestDate && month <= startOfMonth(earliestDate)}
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
              {week.map((day, dayIndex) => (
                <td key={'day-' + dayIndex}>
                  {day && (
                    <Button
                      variant="light"
                      className={cx(
                        day.available && classes.available,
                        isSameDay(day.date, selected) && classes.selected
                      )}
                      aria-pressed={selected ? isSameDay(day.date, selected) : undefined}
                      disabled={
                        (!day.available && !allowUnavailableDates) ||
                        (!!earliestDate && isBeforeDay(day.date, earliestDate))
                      }
                      onClick={() => onClick(day.date)}
                    >
                      {day.date.getDate()}
                    </Button>
                  )}
                </td>
              ))}
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
