// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { Extension, HealthcareService, Reference, Schedule } from '@medplum/fhirtypes';
import { SchedulingParametersURI } from './scheduling';

type DurationUnit = 'h' | 'min' | 'd' | 'wk';

function durationExtensionToMinutes(ext: Extension | undefined): number | undefined {
  const duration = ext?.valueDuration;
  if (duration?.value === undefined) {
    return undefined;
  }
  switch (duration.unit as DurationUnit) {
    case 'wk':
      return duration.value * 60 * 24 * 7;
    case 'd':
      return duration.value * 60 * 24;
    case 'h':
      return duration.value * 60;
    case 'min':
    default:
      return duration.value;
  }
}

function minutesToDurationExtension(url: string, minutes: number): Extension {
  return { url, valueDuration: { value: minutes, unit: 'min' } };
}

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

/**
 * Client-side parse/serialize for the visit-type-level `SchedulingParameters`
 * fields on a `HealthcareService` (spec §4, §10 — the "genuinely new work,
 * highest-risk piece" for the Configuration screen's Visit Types tab).
 * Mirrors `packages/server/src/fhir/operations/utils/scheduling-parameters.ts`'s
 * `getHealthcareServiceSchedulingParameters`. Per that file's `exactlyZero`
 * validation, a HealthcareService's extension must NOT carry `service` or
 * `availability` sub-extensions (those are Schedule-level only) — this
 * helper never reads or writes them.
 */
export type VisitTypeSchedulingParams = {
  duration?: number; // minutes — required by $find/$book, but left optional here so a not-yet-configured visit type can round-trip
  bufferBefore: number; // minutes
  bufferAfter: number; // minutes
  alignmentInterval: number; // minutes ("appointments can start every N min")
  alignmentOffset: number; // minutes
  timezone?: string;
};

// Mirrors the server's SERVICE_DEFAULTS (scheduling-parameters.ts) for the
// fields this screen exposes.
export const VISIT_TYPE_SCHEDULING_DEFAULTS: Omit<VisitTypeSchedulingParams, 'duration' | 'timezone'> = {
  bufferBefore: 0,
  bufferAfter: 0,
  alignmentInterval: 60,
  alignmentOffset: 0,
};

/**
 * Reads the visit-type-level scheduling fields off a HealthcareService's
 * SchedulingParameters extension, applying the same defaults the server
 * falls back to when a field (or the whole extension) is absent.
 * @param healthcareService - The visit type to read from.
 * @returns The parsed duration/buffer/alignment/timezone parameters.
 */
export function getVisitTypeSchedulingParams(healthcareService: HealthcareService): VisitTypeSchedulingParams {
  const extension = getExtensionsByUrl(healthcareService, SchedulingParametersURI)[0];
  if (!extension) {
    return { ...VISIT_TYPE_SCHEDULING_DEFAULTS };
  }
  const get = (url: string): Extension | undefined => getExtensionsByUrl(extension, url)[0];
  return {
    duration: durationExtensionToMinutes(get('duration')),
    bufferBefore: durationExtensionToMinutes(get('bufferBefore')) ?? VISIT_TYPE_SCHEDULING_DEFAULTS.bufferBefore,
    bufferAfter: durationExtensionToMinutes(get('bufferAfter')) ?? VISIT_TYPE_SCHEDULING_DEFAULTS.bufferAfter,
    alignmentInterval:
      durationExtensionToMinutes(get('alignmentInterval')) ?? VISIT_TYPE_SCHEDULING_DEFAULTS.alignmentInterval,
    alignmentOffset: durationExtensionToMinutes(get('alignmentOffset')) ?? VISIT_TYPE_SCHEDULING_DEFAULTS.alignmentOffset,
    timezone: get('timezone')?.valueCode,
  };
}

/**
 * Serializes visit-type-level scheduling fields into a new HealthcareService
 * SchedulingParameters extension, replacing whatever extension is there
 * today (there's nothing else legally allowed inside it per the server's
 * `exactlyZero` checks for `service`/`availability`, so a full replace is
 * safe — unlike the Schedule-level helpers, which must preserve sibling
 * sub-extensions). Save via a normal `medplum.updateResource`.
 * @param healthcareService - The visit type to update.
 * @param params - The new duration/buffer/alignment/timezone parameters.
 * @returns A new HealthcareService object with the extension replaced (does not mutate the input).
 */
export function setVisitTypeSchedulingParams(
  healthcareService: HealthcareService,
  params: VisitTypeSchedulingParams
): HealthcareService {
  const subExtensions: Extension[] = [];
  if (params.duration !== undefined) {
    subExtensions.push(minutesToDurationExtension('duration', params.duration));
  }
  subExtensions.push(minutesToDurationExtension('bufferBefore', params.bufferBefore));
  subExtensions.push(minutesToDurationExtension('bufferAfter', params.bufferAfter));
  subExtensions.push(minutesToDurationExtension('alignmentInterval', params.alignmentInterval));
  subExtensions.push(minutesToDurationExtension('alignmentOffset', params.alignmentOffset));
  if (params.timezone) {
    subExtensions.push({ url: 'timezone', valueCode: params.timezone });
  }

  const newExtension: Extension = { url: SchedulingParametersURI, extension: subExtensions };
  const extensions = (healthcareService.extension ?? []).filter((e) => e.url !== SchedulingParametersURI);
  extensions.push(newExtension);
  return { ...healthcareService, extension: extensions };
}

/**
 * Per-resource buffer (turnover/cleanup) override for a Room/Device's own
 * Schedule (spec §8 Tab 2, §10) — the ONLY per-resource override allowed.
 * Duration and alignment must never be set here: `$find`'s
 * `extractCommonParameters`/`assertAllMatch` throws `badRequest` if they
 * differ across the schedules in a multi-resource combo, so those two stay
 * visit-type-level only (Tab 1).
 */
export type ResourceBufferOverride = {
  bufferBefore?: number;
  bufferAfter?: number;
};

/**
 * Reads a Room/Device Schedule's per-resource buffer override for a given
 * visit type, if any.
 * @param schedule - The Schedule to read from.
 * @param healthcareService - The visit type this override applies to.
 * @returns The buffer override, or an empty object if none is set (inherits the visit type's defaults).
 */
export function getScheduleBufferOverride(
  schedule: Schedule,
  healthcareService: Reference<HealthcareService> | (HealthcareService & { id: string })
): ResourceBufferOverride {
  const { extension } = findSchedulingParametersExtension(schedule, healthcareService);
  if (!extension) {
    return {};
  }
  return {
    bufferBefore: durationExtensionToMinutes(getExtensionsByUrl(extension, 'bufferBefore')[0]),
    bufferAfter: durationExtensionToMinutes(getExtensionsByUrl(extension, 'bufferAfter')[0]),
  };
}

/**
 * Serializes a per-resource buffer override onto a Room/Device's Schedule,
 * leaving every other sub-extension (service, availability, and — though
 * this screen never writes them — duration/alignment) untouched. Save via a
 * normal `medplum.updateResource`.
 * @param schedule - The Schedule to update.
 * @param healthcareService - The visit type this override applies to.
 * @param override - The new buffer override (an undefined field clears that buffer, falling back to the visit type's default).
 * @returns A new Schedule object with the extension patched (does not mutate the input).
 */
export function setScheduleBufferOverride(
  schedule: Schedule,
  healthcareService: Reference<HealthcareService> | (HealthcareService & { id: string }),
  override: ResourceBufferOverride
): Schedule {
  const serviceRef = getReferenceString(healthcareService);
  const { index, extension } = findSchedulingParametersExtension(schedule, healthcareService);

  const otherSubExtensions = (extension?.extension ?? []).filter(
    (e) => e.url !== 'bufferBefore' && e.url !== 'bufferAfter'
  );
  const subExtensions: Extension[] = [...otherSubExtensions];
  if (!subExtensions.some((e) => e.url === 'service')) {
    subExtensions.push({ url: 'service', valueReference: { reference: serviceRef } });
  }
  if (override.bufferBefore !== undefined) {
    subExtensions.push(minutesToDurationExtension('bufferBefore', override.bufferBefore));
  }
  if (override.bufferAfter !== undefined) {
    subExtensions.push(minutesToDurationExtension('bufferAfter', override.bufferAfter));
  }

  const newExtension: Extension = { url: SchedulingParametersURI, extension: subExtensions };
  const extensions = [...(schedule.extension ?? [])];
  if (index >= 0) {
    extensions[index] = newExtension;
  } else {
    extensions.push(newExtension);
  }

  return { ...schedule, extension: extensions };
}
