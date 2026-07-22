// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { Extension, HealthcareService, Reference, Schedule } from '@medplum/fhirtypes';
import { SchedulingParametersURI } from './scheduling';

/**
 * Client-side parse/serialize for `Schedule.extension[SchedulingParameters].availability`
 * (spec §4.1, §8) — the highest-risk new piece of the Calendar & Availability
 * screen. There is no published read/write helper for this extension
 * anywhere in the repo (server-internal parsing only), so this mirrors
 * `packages/server/src/fhir/operations/utils/scheduling-parameters.ts`'s
 * shape byte-for-byte. A malformed extension here won't throw client-side —
 * it will silently fail to match server-side parsing rules, so keep this in
 * lockstep with the server file if that ever changes.
 */

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const ALL_DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

// A single recurring weekly window. `allDay: true` is the FHIR "wraps to the
// next day" convention (00:00:00 -> 00:00:00 on the given days means 24h
// availability on those days) — see server file's `alwaysAvailable` comment.
export type AvailabilityWindow = {
  dayOfWeek: DayOfWeek[];
  availableStartTime: string; // HH:mm:ss
  availableEndTime: string; // HH:mm:ss
  allDay?: boolean;
};

function getExtensionsByUrl(parent: { extension?: Extension[] } | undefined, url: string): Extension[] {
  return (parent?.extension ?? []).filter((e) => e.url === url);
}

function isDayOfWeek(s: string): s is DayOfWeek {
  return (ALL_DAYS as string[]).includes(s);
}

export const DAY_INDEX: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Explodes any multi-day windows into one window per weekday, so the weekday
 * grid editor can map each calendar event 1:1 to a window and edit/delete a
 * single day without the recurring-event "this vs. all" ambiguity (a
 * seeded "Mon-Fri 8-5" window becomes five independent per-day windows).
 * `$find` treats the exploded form identically to the collapsed form.
 * @param windows - Windows that may each carry multiple daysOfWeek.
 * @returns One window per (weekday) — every returned window has a single-entry dayOfWeek.
 */
export function toPerDayWindows(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  return windows.flatMap((w) =>
    (w.dayOfWeek.length ? w.dayOfWeek : []).map((d) => ({
      dayOfWeek: [d],
      availableStartTime: w.availableStartTime,
      availableEndTime: w.availableEndTime,
      allDay: w.allDay,
    }))
  );
}

// A synthetic (non-persisted) "free" background block for the Calendar
// screen's "show availability" overlay (spec §4.7) — a read-only glance at
// the recurring `availability` windows computed client-side, since open
// time is implicit (never materialized as `Slot` resources, spec §4.1) and
// this overlay is never a bookable surface.
export type AvailabilityBlock = { start: string; end: string };

export function computeAvailabilityBlocks(windows: AvailabilityWindow[], range: { start: Date; end: Date }): AvailabilityBlock[] {
  const blocks: AvailabilityBlock[] = [];
  const day = new Date(range.start);
  day.setHours(0, 0, 0, 0);
  while (day <= range.end) {
    const dayOfWeek = DAY_INDEX[day.getDay()];
    for (const window of windows) {
      if (!window.dayOfWeek.includes(dayOfWeek)) {
        continue;
      }
      const start = new Date(day);
      const end = new Date(day);
      if (window.allDay || (window.availableStartTime === '00:00:00' && window.availableEndTime === '00:00:00')) {
        end.setDate(end.getDate() + 1);
      } else {
        const [sh, sm] = window.availableStartTime.split(':').map(Number);
        const [eh, em] = window.availableEndTime.split(':').map(Number);
        start.setHours(sh, sm, 0, 0);
        end.setHours(eh, em, 0, 0);
        if (end <= start) {
          end.setDate(end.getDate() + 1);
        }
      }
      blocks.push({ start: start.toISOString(), end: end.toISOString() });
    }
    day.setDate(day.getDate() + 1);
  }
  return blocks;
}

// Finds the Schedule-level SchedulingParameters extension matching the given
// HealthcareService (mirrors server's `getScheduleSchedulingParameters`
// filter: at most one extension whose `service` sub-extension references
// this HealthcareService). Returns its index in `schedule.extension` (-1 if
// none exists yet) and the extension itself, if found.
function findSchedulingParametersExtension(
  schedule: Schedule,
  healthcareService: Reference<HealthcareService> | (HealthcareService & { id: string })
): { index: number; extension: Extension | undefined } {
  const serviceRef = getReferenceString(healthcareService);
  const extensions = schedule.extension ?? [];
  const index = extensions.findIndex((ext) => {
    if (ext.url !== SchedulingParametersURI) {
      return false;
    }
    const serviceExts = getExtensionsByUrl(ext, 'service');
    return serviceExts.some((se) => se.valueReference && getReferenceString(se.valueReference) === serviceRef);
  });
  return { index, extension: index >= 0 ? extensions[index] : undefined };
}

/**
 * Parses the recurring weekly `availability` sub-extension for a given
 * Schedule/HealthcareService pairing. Returns an empty array if no matching
 * SchedulingParameters extension exists yet (schedule falls back to the
 * service/system default of "always available", not represented here as a
 * window — the Availability editor should treat an empty array as "not yet
 * configured," not "never available").
 * @param schedule - The Schedule to read from.
 * @param healthcareService - The visit type (HealthcareService) this availability applies to.
 * @returns The parsed recurring weekly availability windows.
 */
export function getScheduleAvailability(
  schedule: Schedule,
  healthcareService: Reference<HealthcareService> | (HealthcareService & { id: string })
): AvailabilityWindow[] {
  const { extension } = findSchedulingParametersExtension(schedule, healthcareService);
  if (!extension) {
    return [];
  }
  const availabilityExts = getExtensionsByUrl(extension, 'availability');
  const windows: AvailabilityWindow[] = [];
  for (const availabilityExt of availabilityExts) {
    for (const availTime of getExtensionsByUrl(availabilityExt, 'availableTime')) {
      const dayOfWeek = getExtensionsByUrl(availTime, 'daysOfWeek')
        .map((e) => e.valueCode)
        .filter((c): c is DayOfWeek => !!c && isDayOfWeek(c));

      const allDayExt = getExtensionsByUrl(availTime, 'allDay')[0];
      if (allDayExt?.valueBoolean) {
        windows.push({ dayOfWeek, availableStartTime: '00:00:00', availableEndTime: '00:00:00', allDay: true });
        continue;
      }

      const start = getExtensionsByUrl(availTime, 'availableStartTime')[0]?.valueTime;
      const end = getExtensionsByUrl(availTime, 'availableEndTime')[0]?.valueTime;
      if (start && end) {
        windows.push({ dayOfWeek, availableStartTime: start, availableEndTime: end });
      }
      // Windows missing one of start/end are silently dropped here (the
      // server throws badRequest on save instead) — the editor should never
      // produce such a window in the first place.
    }
  }
  return windows;
}

/**
 * Serializes recurring weekly availability windows into a new `Schedule`
 * extension array, replacing (or adding) the `availability` sub-extension
 * for the given HealthcareService while leaving every other sub-extension
 * (duration, buffers, alignment, timezone) and every other top-level
 * extension on the Schedule untouched. Save via a normal `medplum.updateResource`
 * — no new server endpoint required, since `$find` re-parses whatever
 * extension is currently on the Schedule at query time (spec §4.1).
 * @param schedule - The Schedule to update.
 * @param healthcareService - The visit type (HealthcareService) this availability applies to.
 * @param windows - The new recurring weekly availability windows.
 * @returns A new Schedule object with the extension array patched (does not mutate the input).
 */
export function setScheduleAvailability(
  schedule: Schedule,
  healthcareService: Reference<HealthcareService> | (HealthcareService & { id: string }),
  windows: AvailabilityWindow[]
): Schedule {
  const serviceRef = getReferenceString(healthcareService);
  const { index, extension } = findSchedulingParametersExtension(schedule, healthcareService);

  const availabilityExtension: Extension = {
    url: 'availability',
    extension: windows.map((w) => ({
      url: 'availableTime',
      extension: [
        ...w.dayOfWeek.map((d) => ({ url: 'daysOfWeek', valueCode: d })),
        ...(w.allDay
          ? [{ url: 'allDay', valueBoolean: true }]
          : [
              { url: 'availableStartTime', valueTime: w.availableStartTime },
              { url: 'availableEndTime', valueTime: w.availableEndTime },
            ]),
      ],
    })),
  };

  const otherSubExtensions = (extension?.extension ?? []).filter((e) => e.url !== 'availability');
  const newExtension: Extension = {
    url: SchedulingParametersURI,
    extension: [
      ...otherSubExtensions,
      // Ensure `service` is present even if this is a brand-new extension.
      ...(otherSubExtensions.some((e) => e.url === 'service')
        ? []
        : [{ url: 'service', valueReference: { reference: serviceRef } }]),
      availabilityExtension,
    ],
  };

  const extensions = [...(schedule.extension ?? [])];
  if (index >= 0) {
    extensions[index] = newExtension;
  } else {
    extensions.push(newExtension);
  }

  return { ...schedule, extension: extensions };
}
