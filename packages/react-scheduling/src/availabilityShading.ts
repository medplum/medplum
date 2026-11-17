// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * Works out the colored blocks a calendar draws behind its events to say when a visit type can be booked.
 *
 * A prototype. Two things here are not what scheduling does today:
 *
 * - A window can be scoped to a service facility, through a `serviceFacility` sub-extension on an
 *   `availableTime`. `SchedulingParameters` has no such scope, and the scheduling operations ignore it.
 * - Windows are read as wall-clock times in the viewer's zone, as the calendar's `availableTime` overlay
 *   reads them, rather than in the zone `getSchedulingTimezone` resolves.
 */
import type { WithId } from '@medplum/core';
import {
  getExtension,
  getExtensions,
  getReferenceString,
  getScheduleSchedulingParameters,
  isReference,
  serviceTypeOffersService,
} from '@medplum/core';
import type {
  Appointment,
  HealthcareService,
  HealthcareServiceAvailableTime,
  Location,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { toAvailableTime } from './availability';
import type { CalendarFilterValues } from './SchedulingWorkspace/CalendarFilters';
import type { DateTimeRange } from './types';

/** The `availableTime` sub-extension naming the one service facility a window holds at. Prototype only. */
export const AVAILABILITY_SERVICE_FACILITY_URL = 'serviceFacility';

/** How many colors sit side by side over one stretch of time before the rest collapse into "+N". */
const MAX_LANES = 3;

/** The shortest block that is given a label, in minutes. */
const MIN_LABELED_MINUTES = 30;

const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const MINUTE_MS = 60_000;

/** One recurring stretch of a calendar's availability for a visit type. */
export interface AvailabilityWindow {
  readonly service: WithId<HealthcareService>;
  readonly availableTime: HealthcareServiceAvailableTime;
  /** The one service facility the window holds at, or absent for a window that holds at all of them. */
  readonly serviceFacility?: Reference<Location>;
  /** Whether these are the visit type's default hours, the calendar setting none of its own for it. */
  readonly inherited: boolean;
}

/** A calendar whose availability is drawn, with what takes its time. */
export interface AvailabilityShadingCalendar {
  readonly schedule: WithId<Schedule>;
  /** Every appointment held on the calendar in range, whether or not the calendar filters leave it drawn. */
  readonly appointments: readonly Appointment[];
  /** The calendar's Slots in range; the busy ones are blocked time. */
  readonly slots: readonly Slot[];
}

export interface AvailabilityShadingInput {
  readonly calendars: readonly AvailabilityShadingCalendar[];
  /** The visit types whose windows are drawn when the filters choose none. */
  readonly services: readonly WithId<HealthcareService>[];
  readonly filters: CalendarFilterValues;
  /** The days on show. */
  readonly range: DateTimeRange;
  /** Names a visit type's color. Visit types given the same color are drawn as one. */
  readonly colorOf: (service: WithId<HealthcareService>) => string;
}

/** What one stretch of a block is made of, for whoever asks why it is there. */
export interface AvailabilityShadeDetail {
  readonly schedule: WithId<Schedule>;
  readonly service: WithId<HealthcareService>;
  readonly start: Date;
  readonly end: Date;
  readonly serviceFacility?: Reference<Location>;
  readonly inherited: boolean;
}

/** One colored block behind a day's events. */
export interface AvailabilityShade {
  readonly id: string;
  readonly start: Date;
  readonly end: Date;
  /**
   * What the block stands for: when any calendar on show can take the chosen visit type (`service`), when
   * the one calendar on show takes the visit types of a color (`calendar`), or the visit types that had no
   * room beside the others (`overflow`).
   */
  readonly kind: 'service' | 'calendar' | 'overflow';
  /** The color `colorOf` named. Absent for `overflow`. */
  readonly color?: string;
  /** Where the block starts across the day's column, from 0 to 1. */
  readonly left: number;
  /** How much of the day's column the block spans, from 0 to 1. */
  readonly width: number;
  /** Shown on the block. Only the first block a window leaves on a day has one. */
  readonly label?: string;
  /** Shown under the label: the service facility while none is chosen, and whether the hours are a default. */
  readonly tag?: string;
  readonly details: readonly AvailabilityShadeDetail[];
}

export interface AvailabilityShading {
  /**
   * `service` when the filters choose a visit type, `calendar` when they don't and one calendar is on show,
   * and otherwise `off`: several calendars' every visit type at once says nothing, so nothing is drawn.
   */
  readonly mode: 'service' | 'calendar' | 'off';
  readonly shades: readonly AvailabilityShade[];
}

/**
 * Reads the windows a calendar is available in for a visit type: the hours the Schedule sets for it, or
 * else the visit type's default hours when the Schedule offers it.
 * @param schedule - The calendar's Schedule.
 * @param service - The visit type.
 * @returns The windows, empty for a visit type the calendar neither sets hours for nor offers.
 */
export function getScheduleAvailabilityWindows(
  schedule: Schedule,
  service: WithId<HealthcareService>
): AvailabilityWindow[] {
  const own = getScheduleSchedulingParameters(schedule, service, 'availability');
  if (own.length) {
    return own
      .flatMap((availability) => getExtensions(availability, 'availableTime'))
      .map((availableTime) => {
        const facility = getExtension(availableTime, AVAILABILITY_SERVICE_FACILITY_URL)?.valueReference;
        return {
          service,
          availableTime: toAvailableTime(availableTime),
          serviceFacility: isReference<Location>(facility, 'Location') ? facility : undefined,
          inherited: false,
        };
      });
  }
  if (!serviceTypeOffersService(schedule.serviceType, service)) {
    return [];
  }
  return (service.availableTime ?? []).map((availableTime) => ({ service, availableTime, inherited: true }));
}

interface Interval {
  readonly start: number;
  readonly end: number;
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

// The stretch of one day a window covers, in the viewer's zone. An end at or before the start runs past
// midnight, and is drawn whole from the day it starts on.
function intervalOn(day: Date, availableTime: HealthcareServiceAvailableTime): Interval | undefined {
  if (!availableTime.daysOfWeek?.includes(DAY_CODES[day.getDay()])) {
    return undefined;
  }
  const at = (minutes: number): number =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).getTime();
  if (availableTime.allDay) {
    return { start: at(0), end: at(24 * 60) };
  }
  if (!availableTime.availableStartTime || !availableTime.availableEndTime) {
    return undefined;
  }
  const start = minutesOf(availableTime.availableStartTime);
  const end = minutesOf(availableTime.availableEndTime);
  return { start: at(start), end: at(end <= start ? end + 24 * 60 : end) };
}

function eachDay(range: DateTimeRange): Date[] {
  const days: Date[] = [];
  const day = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
  while (day < range.end) {
    days.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }
  return days;
}

const NOT_HELD = ['cancelled', 'noshow', 'entered-in-error'];
const BLOCKING = ['busy', 'busy-unavailable', 'busy-tentative'];

// Everything that takes a calendar's time, in order of start.
function busyIntervals(calendar: AvailabilityShadingCalendar): Interval[] {
  const held = [
    ...calendar.appointments.filter((appointment) => !NOT_HELD.includes(appointment.status)),
    ...calendar.slots.filter((slot) => BLOCKING.includes(slot.status)),
  ];
  return held
    .filter((item) => item.start && item.end)
    .map((item) => ({ start: new Date(item.start as string).getTime(), end: new Date(item.end as string).getTime() }))
    .sort((a, b) => a.start - b.start);
}

// What is left of an interval once the busy stretches, in order of start, are taken out of it.
function subtract(interval: Interval, busy: readonly Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = interval.start;
  for (const taken of busy) {
    if (taken.end <= cursor) {
      continue;
    }
    if (taken.start >= interval.end) {
      break;
    }
    if (taken.start > cursor) {
      free.push({ start: cursor, end: taken.start });
    }
    cursor = Math.max(cursor, taken.end);
  }
  if (cursor < interval.end) {
    free.push({ start: cursor, end: interval.end });
  }
  return free;
}

// Joins the intervals that overlap or touch, keeping what each was made of.
function merge<T extends Interval>(intervals: readonly T[]): (Interval & { parts: T[] })[] {
  const merged: { start: number; end: number; parts: T[] }[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
      last.parts.push(interval);
    } else {
      merged.push({ start: interval.start, end: interval.end, parts: [interval] });
    }
  }
  return merged;
}

interface Placed<T> {
  readonly item: T;
  readonly lane: number;
  /** How many lanes the item can spread over before meeting another. */
  readonly span: number;
  /** How many lanes its cluster of overlapping items needs. */
  readonly lanes: number;
}

// Gives overlapping items a lane each, as a calendar lays out overlapping events.
function assignLanes<T extends Interval>(items: readonly T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const clusters: { end: number; laneEnds: number[]; members: { item: T; lane: number }[] }[] = [];
  for (const item of sorted) {
    let cluster = clusters.at(-1);
    if (!cluster || item.start >= cluster.end) {
      cluster = { end: item.end, laneEnds: [], members: [] };
      clusters.push(cluster);
    }
    let lane = cluster.laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = cluster.laneEnds.length;
    }
    cluster.laneEnds[lane] = item.end;
    cluster.members.push({ item, lane });
    cluster.end = Math.max(cluster.end, item.end);
  }
  return clusters.flatMap((cluster) =>
    cluster.members.map(({ item, lane }) => {
      let span = 1;
      while (
        lane + span < cluster.laneEnds.length &&
        !cluster.members.some(
          (other) => other.lane === lane + span && other.item.start < item.end && other.item.end > item.start
        )
      ) {
        span++;
      }
      return { item, lane, span, lanes: cluster.laneEnds.length };
    })
  );
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function serviceName(service: HealthcareService): string {
  return service.name ?? 'Visit type';
}

function facilityNames(windows: readonly AvailabilityWindow[]): string {
  return unique(windows.map((window) => window.serviceFacility?.display ?? 'Any facility')).join(' + ');
}

function isLabeled(interval: Interval): boolean {
  return interval.end - interval.start >= MIN_LABELED_MINUTES * MINUTE_MS;
}

interface DayWindow extends Interval {
  readonly window: AvailabilityWindow;
  readonly schedule: WithId<Schedule>;
}

function toDetail(part: DayWindow): AvailabilityShadeDetail {
  return {
    schedule: part.schedule,
    service: part.window.service,
    start: new Date(part.start),
    end: new Date(part.end),
    serviceFacility: part.window.serviceFacility,
    inherited: part.window.inherited,
  };
}

// One visit type: a flat block wherever any calendar is free to take it.
function serviceShades(
  free: readonly DayWindow[],
  color: string,
  showFacility: boolean
): Omit<AvailabilityShade, 'id'>[] {
  let labeled = false;
  return merge(free).map((block) => {
    const windows = block.parts.map((part) => part.window);
    const label = !labeled && isLabeled(block) ? serviceName(windows[0].service) : undefined;
    labeled ||= !!label;
    const tags = [
      showFacility ? facilityNames(windows) : undefined,
      windows.every((window) => window.inherited) ? 'default hours' : undefined,
    ].filter(Boolean);
    return {
      start: new Date(block.start),
      end: new Date(block.end),
      kind: 'service',
      color,
      left: 0,
      width: 1,
      label,
      tag: label && tags.length ? tags.join(' · ') : undefined,
      details: block.parts.map(toDetail),
    };
  });
}

// One calendar: its windows by color, different colors side by side, each with the calendar's busy time
// taken out.
function calendarShades(
  windows: readonly DayWindow[],
  busy: readonly Interval[],
  colorOf: AvailabilityShadingInput['colorOf'],
  showFacility: boolean
): Omit<AvailabilityShade, 'id'>[] {
  const colors = unique(windows.map((window) => colorOf(window.window.service)));
  const blocks = colors.flatMap((color) =>
    merge(windows.filter((window) => colorOf(window.window.service) === color)).map((block) => ({ ...block, color }))
  );
  const placed = assignLanes(blocks);
  const shades: Omit<AvailabilityShade, 'id'>[] = [];

  for (const { item, lane, span, lanes } of placed) {
    const crowded = lanes > MAX_LANES;
    if (crowded && lane >= MAX_LANES) {
      continue;
    }
    // A crowded stretch keeps its last sixth for the "+N" block.
    const laneWidth = crowded ? 5 / 6 / MAX_LANES : 1 / lanes;
    const memberWindows = item.parts.map((part) => part.window);
    let labeled = false;
    const names = unique(memberWindows.map((window) => serviceName(window.service))).join(', ');
    for (const piece of subtract(item, busy)) {
      const label = !labeled && isLabeled(piece) ? names : undefined;
      labeled ||= isLabeled(piece);
      shades.push({
        start: new Date(piece.start),
        end: new Date(piece.end),
        kind: 'calendar',
        color: item.color,
        left: lane * laneWidth,
        width: laneWidth * (crowded ? Math.min(span, MAX_LANES - lane) : span),
        label,
        tag: label && showFacility ? facilityNames(memberWindows) : undefined,
        details: item.parts.map(toDetail),
      });
    }
  }

  // The colors with no lane of their own share one block, which says how many visit types it stands for.
  const overflow = merge(placed.filter((p) => p.lanes > MAX_LANES && p.lane >= MAX_LANES).map((p) => p.item));
  for (const block of overflow) {
    const parts = block.parts.flatMap((item) => item.parts);
    const count = unique(parts.map((part) => getReferenceString(part.window.service))).length;
    let labeled = false;
    for (const piece of subtract(block, busy)) {
      const label = !labeled && isLabeled(piece) ? `+${count}` : undefined;
      labeled ||= isLabeled(piece);
      shades.push({
        start: new Date(piece.start),
        end: new Date(piece.end),
        kind: 'overflow',
        left: 5 / 6,
        width: 1 / 6,
        label,
        details: parts.map(toDetail),
      });
    }
  }
  return shades;
}

/**
 * Works out the availability blocks to draw behind a calendar's events.
 *
 * With a visit type chosen, a block covers every stretch in which at least one calendar on show can take
 * it. With none chosen and one calendar on show, that calendar's own windows are drawn in each visit
 * type's color: same-colored visit types as one block, different colors side by side. With none chosen and
 * several calendars on show, nothing is drawn.
 *
 * A calendar's appointments and blocked time are taken out of its own availability before calendars are
 * combined, so an appointment the filters hide still leaves its gap. A visit type's default hours are
 * drawn only when that visit type is chosen. With a service facility chosen, windows scoped to another
 * are left out.
 * @param input - The calendars, visit types, filters and days on show.
 * @returns The blocks, and which of the three cases they were worked out for.
 */
export function computeAvailabilityShading(input: AvailabilityShadingInput): AvailabilityShading {
  const { calendars, services, filters, range, colorOf } = input;
  const chosen = filters.service;
  if (!chosen && calendars.length !== 1) {
    return { mode: 'off', shades: [] };
  }

  const facility = filters.serviceFacility && getReferenceString(filters.serviceFacility);
  const sources = calendars.map((calendar) => ({
    schedule: calendar.schedule,
    busy: busyIntervals(calendar),
    windows: (chosen ? [chosen] : services)
      .flatMap((service) => getScheduleAvailabilityWindows(calendar.schedule, service))
      .filter((window) => chosen || !window.inherited)
      .filter((window) => !facility || !window.serviceFacility || window.serviceFacility.reference === facility),
  }));

  const shades: AvailabilityShade[] = [];
  for (const day of eachDay(range)) {
    const daySources = sources.map(({ schedule, busy, windows }) => ({
      busy,
      windows: windows.flatMap((window): DayWindow[] => {
        const interval = intervalOn(day, window.availableTime);
        return interval ? [{ ...interval, window, schedule }] : [];
      }),
    }));
    const dayShades = chosen
      ? serviceShades(
          daySources.flatMap(({ busy, windows }) =>
            windows.flatMap((window) => subtract(window, busy).map((piece) => ({ ...window, ...piece })))
          ),
          colorOf(chosen),
          !facility
        )
      : calendarShades(daySources[0].windows, daySources[0].busy, colorOf, !facility);
    dayShades.forEach((shade, index) => shades.push({ ...shade, id: `availability-${day.getTime()}-${index}` }));
  }
  return { mode: chosen ? 'service' : 'calendar', shades };
}
