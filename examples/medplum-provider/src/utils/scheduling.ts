// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getIdentifier, setIdentifier } from '@medplum/core';
import type { Identifier, Resource } from '@medplum/fhirtypes';
import { v4 as uuidv4 } from 'uuid';
import type { SchedulingParametersExtension } from '../contexts/SchedulingContext';

const MedplumSchedulingTransientIdentifierURI = 'https://medplum.com/fhir/scheduling-transient-id';

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const SchedulingTransientIdentifier = {
  set(resource: Resource & { identifier?: Identifier[] }) {
    setIdentifier(resource, MedplumSchedulingTransientIdentifierURI, uuidv4(), { use: 'temp' });
  },

  get(resource: Resource) {
    return getIdentifier(resource, MedplumSchedulingTransientIdentifierURI);
  },
};

export const DayMap = Object.freeze({
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
});

export function toMinutes(value: number | undefined, unit: string): number {
  if (value === undefined) {
    throw new Error('Got duration without value');
  }

  switch (unit) {
    case 'wk':
      return value * 60 * 24 * 7;
    case 'd':
      return value * 60 * 24;
    case 'h':
      return value * 60;
    case 'min':
      return value;
    default:
      throw new Error(`Got unhandled unit "${unit}"`);
  }
}

// Minute offsets into each day of the week when the provider is available.
export type AvailabilityByDay = Record<DayOfWeek, { start: number; end: number }[]>;

function minuteOffset(timeOfDay: `${number}:${number}:${number}`): number {
  const [hour, minute, _second] = timeOfDay.split(':').map(Number);
  return hour * 60 + minute;
}

const minutesPerDay = 24 * 60;

// Translate availability recurrence rules into data structure more useful for display
export function extractAvailability(params: SchedulingParametersExtension): AvailabilityByDay {
  const result: AvailabilityByDay = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

  for (const ext of params.extension) {
    if (ext.url !== 'availability') {
      continue;
    }
    const details = ext.valueTiming.repeat;
    const duration = toMinutes(details.duration, details.durationUnit);
    const days = details.dayOfWeek.map((day) => DayMap[day]);

    for (const timeOfDay of details.timeOfDay) {
      let start = minuteOffset(timeOfDay);
      let end = start + duration;
      let currentDays = days;

      // When availability crosses midnight, push an interval up to midnight
      // and continue on the next day(s). For example, "Tuesday starting at 9pm
      // lasting for 6 hours" becomes ["Tuesday 9pm–midnight", "Wednesday
      // 12am–3am"].
      while (end > minutesPerDay) {
        for (const day of currentDays) {
          result[day].push({ start, end: minutesPerDay });
        }
        start = 0;
        end -= minutesPerDay;
        currentDays = currentDays.map((day) => ((day + 1) % 7) as DayOfWeek);
      }
      for (const day of currentDays) {
        result[day].push({ start, end });
      }
    }
  }

  return result;
}
