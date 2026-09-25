// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DayOfWeek, WithId } from '@medplum/core';
import { DAYS_OF_WEEK, getScheduleSchedulingParameters } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { getEffectiveAvailability } from '../availability';
import { getEffectiveSchedulingParameterValues } from '../parameterValues';
import type { MinuteRange, WeeklyAvailability } from '../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';
import {
  formatMinutesOfDay,
  toWeeklyAvailability,
} from '../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';

const SHORT_DAYS: Record<DayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/**
 * One line saying how a visit type is scheduled on a calendar: the duration and the weekly hours in effect.
 * @param service - The visit type.
 * @param schedule - The calendar offering it, whose overrides win.
 * @returns The summary, such as `30 min · Mon–Fri 9:00 AM–5:00 PM`.
 */
export function summarizeOffering(service: WithId<HealthcareService>, schedule: Schedule): string {
  const { duration } = getEffectiveSchedulingParameterValues(service, schedule);
  const custom = getScheduleSchedulingParameters(schedule, service, 'availability').length > 0;
  const hours = getEffectiveAvailability(service, schedule);
  const hoursText = hours ? summarizeWeek(toWeeklyAvailability(hours)) : 'Any time (no hours set)';
  const durationText = duration === undefined ? 'No duration' : `${duration} min`;
  return `${durationText} · ${custom ? `Custom hours: ${hoursText}` : hoursText}`;
}

/**
 * Says which days have which hours, grouping the days that share the same hours.
 * @param weekly - The week to describe.
 * @returns The summary, such as `Mon–Fri 9:00 AM–5:00 PM; Sat 9:00 AM–12:00 PM`, or `No hours` for an empty week.
 */
export function summarizeWeek(weekly: WeeklyAvailability): string {
  const groups = new Map<string, DayOfWeek[]>();
  for (const day of DAYS_OF_WEEK) {
    const { available, ranges } = weekly[day];
    if (!available || ranges.length === 0) {
      continue;
    }
    const hours = ranges.map(formatRange).join(', ');
    groups.set(hours, [...(groups.get(hours) ?? []), day]);
  }
  if (groups.size === 0) {
    return 'No hours';
  }
  return [...groups].map(([hours, days]) => `${formatDays(days)} ${hours}`).join('; ');
}

function formatRange(range: MinuteRange): string {
  return `${formatMinutesOfDay(range.start)}–${formatMinutesOfDay(range.end)}`;
}

function formatDays(days: readonly DayOfWeek[]): string {
  const runs: DayOfWeek[][] = [];
  for (const day of days) {
    const run = runs.at(-1);
    const previous = run?.at(-1);
    if (run && previous && DAYS_OF_WEEK.indexOf(day) === DAYS_OF_WEEK.indexOf(previous) + 1) {
      run.push(day);
    } else {
      runs.push([day]);
    }
  }
  return runs
    .map((run) => {
      if (run.length === 1) {
        return SHORT_DAYS[run[0]];
      }
      const separator = run.length === 2 ? ', ' : '–';
      return `${SHORT_DAYS[run[0]]}${separator}${SHORT_DAYS[run[run.length - 1]]}`;
    })
    .join(', ');
}
