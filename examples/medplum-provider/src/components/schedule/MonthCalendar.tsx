// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { localDayKey } from '../../utils/scheduling';
import classes from './MonthCalendar.module.css';

type MonthCalendarProps = {
  month: Date; // any date within the month to display
  daysWithAvailability: Set<string>;
  selectedDayKey: string | undefined; // set when the criteria date range has been narrowed to a single day
  // Called for any day click, including the already-selected day — the
  // caller is responsible for toggling back to the whole month in that case.
  onSelectDay: (day: Date) => void;
  onNavigateMonth: (direction: -1 | 1) => void;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function buildMonthGrid(month: Date): (Date | undefined)[][] {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells: (Date | undefined)[] = Array(leadingBlanks).fill(undefined);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(undefined);
  }

  const weeks: (Date | undefined)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/**
 * Small month calendar shown above the day-grouped slot list (results
 * column, not the criteria/filter column — it's primarily a view of
 * results, not an input). Highlights days that have at least one available
 * resource combo (computed from the already-fetched search results — no
 * separate query) so an admin can see "which days are open" at a glance
 * instead of only a flat/grouped list. Navigating months or clicking a day
 * updates the criteria panel's date range directly (single source of truth
 * for what's actually searched) — there's no separate, decoupled
 * calendar-only query. Clicking the already-selected day toggles back to
 * showing the whole month, rather than a separate "view whole month" control.
 * @param props - Month calendar props.
 * @returns A React element rendering the month calendar.
 */
export function MonthCalendar(props: MonthCalendarProps): JSX.Element {
  const { month, daysWithAvailability, selectedDayKey, onSelectDay, onNavigateMonth } = props;
  const today = useMemo(() => startOfDay(new Date()), []);
  const weeks = useMemo(() => buildMonthGrid(month), [month]);
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className={classes.container}>
      <Group justify="center" gap="sm" className={classes.header}>
        <ActionIcon variant="subtle" size="lg" aria-label="Previous month" onClick={() => onNavigateMonth(-1)}>
          <IconChevronLeft size={20} />
        </ActionIcon>
        <Text className={classes.monthLabel}>{monthLabel}</Text>
        <ActionIcon variant="subtle" size="lg" aria-label="Next month" onClick={() => onNavigateMonth(1)}>
          <IconChevronRight size={20} />
        </ActionIcon>
      </Group>

      <div className={classes.grid}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} size="xs" c="dimmed" ta="center" fw={700} tt="uppercase" className={classes.weekdayLabel}>
            {label}
          </Text>
        ))}
        {weeks.flatMap((week, weekIndex) =>
          week.map((day, dayIndex) => {
            const key = `${weekIndex}-${dayIndex}`;
            if (!day) {
              return <div key={key} />;
            }
            const dayKey = localDayKey(day);
            const isPast = day < today;
            const hasAvailability = daysWithAvailability.has(dayKey);
            const isSelected = selectedDayKey === dayKey;

            return (
              <UnstyledButton
                key={key}
                disabled={isPast}
                onClick={() => onSelectDay(day)}
                className={classes.day}
                data-past={isPast || undefined}
                data-available={hasAvailability || undefined}
                data-selected={isSelected || undefined}
              >
                {day.getDate()}
              </UnstyledButton>
            );
          })
        )}
      </div>
    </div>
  );
}
