import { Button, createStyles, Group } from '@mantine/core';
import { Slot } from '@medplum/fhirtypes';
import { useMemo, useState } from 'react';
import { getMonthString, getStartMonth } from './CalendarInput.utils';

const useStyles = createStyles((theme) => ({
  table: {
    width: 350,

    '& th': {
      fontWeight: 'normal',
      fontSize: 11,
      padding: 8,
      textAlign: 'center',
    },

    '& td': {
      padding: '2px 4px',
    },

    '& td button': {
      width: 44,
      height: 44,
      color: theme.colors[theme.primaryColor][5],
      fontSize: 16,
      fontWeight: 500,
      textAlign: 'center',
      padding: 0,
      backgroundColor: theme.colors[theme.primaryColor][0],
      border: 0,
      borderRadius: '50%',
      cursor: 'pointer',
    },

    '& td button:hover': {
      backgroundColor: theme.colors[theme.primaryColor][1],
    },

    '& td button:disabled': {
      backgroundColor: 'transparent',
      cursor: 'default',
      color: theme.colors.gray[4],
      fontWeight: 'normal',
    },
  },
}));

export interface CalendarInputProps {
  slots: Slot[];
  onChangeMonth: (date: Date) => void;
  onClick: (date: Date) => void;
}

interface CalendarCell {
  date: Date;
  available: boolean;
}

type OptionalCalendarCell = CalendarCell | undefined;

export function CalendarInput(props: CalendarInputProps): JSX.Element {
  const { classes } = useStyles();
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
      <Group position="apart" spacing="xs" grow noWrap>
        <p style={{ flex: 1 }}>{getMonthString(month)}</p>
        <Group position="right" spacing="xs">
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
                    <Button disabled={!day.available} onClick={() => onClick(day.date)}>
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
