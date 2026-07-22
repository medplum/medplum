// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Checkbox, Group, Stack, Switch, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { AvailabilityWindow, DayOfWeek } from '../../utils/schedulingParameters';
import { ALL_DAYS, DAY_LABELS } from '../../utils/schedulingParameters';
import classes from './WeeklyHoursConfig.module.css';

type DayRow = {
  enabled: boolean;
  allDay: boolean;
  start: string; // HH:mm
  end: string; // HH:mm
};

// Mon-first display order (ALL_DAYS is mon..sun already).
const DISPLAY_DAYS: DayOfWeek[] = ALL_DAYS;

function rowsFromWindows(windows: AvailabilityWindow[]): Record<DayOfWeek, DayRow> {
  const rows = {} as Record<DayOfWeek, DayRow>;
  for (const day of DISPLAY_DAYS) {
    rows[day] = { enabled: false, allDay: false, start: '09:00', end: '17:00' };
  }
  for (const w of windows) {
    const day = w.dayOfWeek[0];
    if (!day || !rows[day]) {
      continue;
    }
    // One interval per day in this config view (the data model allows more,
    // but the demo edits a single range per weekday); a day with multiple
    // seeded windows shows the first.
    if (!rows[day].enabled) {
      rows[day] = {
        enabled: true,
        allDay: !!w.allDay,
        start: w.availableStartTime.slice(0, 5),
        end: w.availableEndTime.slice(0, 5),
      };
    }
  }
  return rows;
}

function windowsFromRows(rows: Record<DayOfWeek, DayRow>): AvailabilityWindow[] {
  const windows: AvailabilityWindow[] = [];
  for (const day of DISPLAY_DAYS) {
    const row = rows[day];
    if (!row.enabled) {
      continue;
    }
    windows.push(
      row.allDay
        ? { dayOfWeek: [day], availableStartTime: '00:00:00', availableEndTime: '00:00:00', allDay: true }
        : { dayOfWeek: [day], availableStartTime: `${row.start}:00`, availableEndTime: `${row.end}:00` }
    );
  }
  return windows;
}

/**
 * Recurring weekly hours as a **configuration** view (not a calendar) — the
 * Calendly "weekly hours" style: one row per weekday with an on/off toggle,
 * an all-day switch, and start/end times. Rendering the recurring *pattern*
 * as a calendar was confusing (it duplicated the time-off calendar and
 * invited the recurring-event "this vs. all" question); a plain per-day
 * config reads as what it is — "my standing hours." The one dated calendar
 * (Availability mode's main surface) shows these hours projected as
 * background, so this panel just sets the pattern.
 * @param props - Config props.
 * @param props.windows - Current recurring windows (normalized to one-per-day).
 * @param props.onChange - Called with the rebuilt window list on any edit.
 * @returns The weekly-hours configuration element.
 */
export function WeeklyHoursConfig(props: { windows: AvailabilityWindow[]; onChange: (windows: AvailabilityWindow[]) => void }): JSX.Element {
  const { windows, onChange } = props;
  const rows = rowsFromWindows(windows);

  const patchDay = (day: DayOfWeek, patch: Partial<DayRow>): void => {
    const next = { ...rows, [day]: { ...rows[day], ...patch } };
    onChange(windowsFromRows(next));
  };

  return (
    <Stack gap="xs">
      {DISPLAY_DAYS.map((day) => {
        const row = rows[day];
        return (
          <Group key={day} gap="sm" wrap="nowrap" className={classes.row}>
            <Checkbox
              className={classes.dayCheck}
              label={DAY_LABELS[day]}
              checked={row.enabled}
              onChange={(e) => patchDay(day, { enabled: e.currentTarget.checked })}
            />
            {row.enabled ? (
              <Group gap="xs" wrap="nowrap">
                {row.allDay ? (
                  <Text size="sm" c="dimmed">
                    All day
                  </Text>
                ) : (
                  <>
                    <input
                      type="time"
                      step={60}
                      value={row.start}
                      onChange={(e) => patchDay(day, { start: e.target.value })}
                    />
                    <Text size="sm">–</Text>
                    <input type="time" step={60} value={row.end} onChange={(e) => patchDay(day, { end: e.target.value })} />
                  </>
                )}
                <Switch
                  size="xs"
                  label="All day"
                  checked={row.allDay}
                  onChange={(e) => patchDay(day, { allDay: e.currentTarget.checked })}
                />
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                Unavailable
              </Text>
            )}
          </Group>
        );
      })}
    </Stack>
  );
}
