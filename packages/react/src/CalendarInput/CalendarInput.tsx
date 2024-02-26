import { Button, Group } from '@mantine/core';
import { Slot } from '@medplum/fhirtypes';
import { useMemo, useState } from 'react';
import classes from './CalendarInput.module.css';
import { getMonthString, getStartMonth } from './CalendarInput.utils';

export interface CalendarInputProps {
  readonly slots: Slot[];
  readonly onChangeMonth: (date: Date) => void;
  readonly onClick: (date: Date) => void;
}

interface CalendarCell {
  readonly date: Date;
  readonly available: boolean;
}

type OptionalCalendarCell = CalendarCell | undefined;

export function CalendarInput(props: CalendarInputProps): JSX.Element {
  const { onChangeMonth, onClick } = props;
  const [month, setMonth] = useState<Date>(getStartMonth);

  function moveMonth(delta: number): void {
    setMonth((currMonth) => {
      const newMonth = new Date(currMonth.getTime());
      newMonth.setMonth(currMonth.getMonth() + delta);
      onChangeMonth(newMonth);
      return newMonth;
    });
  }

  const grid = useMemo(() => buildGrid(month, props.slots), [month, props.slots]);

  return (
    <div>
      <Group justify="space-between" gap="xs" grow wrap="nowrap">
        <p style={{ flex: 1 }}>{getMonthString(month)}</p>
        <Group justify="flex-end" gap="xs">
          <Button variant="outline" aria-label="Previous month" onClick={() => moveMonth(-1)}>
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
                    <Button variant="light" disabled={!day.available} onClick={() => onClick(day.date)}>
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

function buildGrid(startDate: Date, slots: Slot[]): OptionalCalendarCell[][] {
  const d = new Date(startDate.getFullYear(), startDate.getMonth());
  const grid: OptionalCalendarCell[][] = [];
  let row: OptionalCalendarCell[] = [];

  // Fill leading empty days
  for (let i = 0; i < d.getDay(); i++) {
    row.push(undefined);
  }

  while (d.getMonth() === startDate.getMonth()) {
    row.push({
      date: new Date(d.getTime()),
      available: isDayAvailable(d, slots),
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
 * @param slots - The list of available slots.
 * @returns True if there are any available slots for the day.
 */
function isDayAvailable(day: Date, slots: Slot[]): boolean {
  // Note that slot start and end time may or may not be in UTC.
  for (const slot of slots) {
    const slotStart = new Date(slot.start as string);
    if (
      slotStart.getFullYear() === day.getFullYear() &&
      slotStart.getMonth() === day.getMonth() &&
      slotStart.getDate() === day.getDate()
    ) {
      return true;
    }
  }

  return false;
}
