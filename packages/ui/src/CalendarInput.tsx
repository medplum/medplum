import React, { useMemo, useState } from 'react';
import { Button } from './Button';
import { InputRow } from './InputRow';
import './CalendarInput.css';

export interface CalendarInputProps {
  isAvailable: (date: Date) => boolean;
  onClick: (date: Date) => void;
}

/**
 * Returns a month display string (e.g. "January 2020").
 * @param date Any date within the month.
 * @returns The month display string (e.g. "January 2020")
 */
export function getMonthString(date: Date): string {
  return date.toLocaleString('default', { month: 'long' }) + ' ' + date.getFullYear();
}

interface CalendarCell {
  date: Date;
  available: boolean;
}

type OptionalCalendarCell = CalendarCell | undefined;

function buildGrid(startDate: Date, isAvailable: (date: Date) => boolean): OptionalCalendarCell[][] {
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
      available: isAvailable(d),
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

export function CalendarInput(props: CalendarInputProps): JSX.Element {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth());
  const [month, setMonth] = useState<Date>(startMonth);

  function moveMonth(delta: number): void {
    setMonth((currMonth) => {
      const prevMonth = new Date(currMonth.getTime());
      prevMonth.setMonth(currMonth.getMonth() + delta);
      return prevMonth;
    });
  }

  const grid = useMemo(() => buildGrid(month, props.isAvailable), [month]);

  return (
    <div>
      <InputRow>
        <p style={{ flex: 1 }}>{getMonthString(month)}</p>
        <p>
          <Button label="Previous month" onClick={() => moveMonth(-1)}>
            &lt;
          </Button>
          <Button label="Next month" onClick={() => moveMonth(1)}>
            &gt;
          </Button>
        </p>
      </InputRow>
      <table className="medplum-calendar-table">
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
                    <button disabled={!day.available} onClick={() => props.onClick(day.date)}>
                      {day.date.getDate()}
                    </button>
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
