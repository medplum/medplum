// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EMPTY } from '@medplum/core';
import type { CodeableConcept, Slot } from '@medplum/fhirtypes';
import { Temporal } from 'temporal-polyfill';
import type { Interval } from '../../../util/date';
import { areIntervalsOverlapping, earliest, latest } from '../../../util/date';
import type { LayeredDict } from '../../../util/layereddict';
import { eachDayOfInterval } from './alignment';
import { availabilityOnDay, hasMatchingServiceType, normalizeIntervals, slotToInterval } from './scheduling';
import type { SchedulingParameters } from './scheduling-parameters';

/**
 * A stretch of availability: recurring hours merged with free Slots, before blocking Slots are
 * removed. `anchors` are the starts of the recurring-hours blocks inside it, in order.
 */
export type AnchoredWindow = Interval & { anchors: Date[] };

/**
 * Returns the availability windows that overlap `range`, each with the anchors its grid is
 * counted from.
 *
 * Recurring hours merge into one block when they touch or overlap on the same local day in
 * `timezone`; hours from different local days never merge. Each block anchors at its start. Free
 * Slots extend the windows but never add an anchor. Blocks are resolved over whole local days, so
 * the anchors for an instant do not depend on how wide `range` is, as long as `slots` holds every
 * free Slot that touches the window. Windows are not clipped to `range`, but availability that
 * runs on past the resolved days (round-the-clock hours) ends where they do.
 *
 * @param params - The availability to resolve
 * @param params.parameters - The schedule's resolved scheduling parameters
 * @param params.timezone - The time zone the recurring hours are defined in
 * @param params.slots - The schedule's Slots; only free Slots matching `serviceType` are used
 * @param params.range - Only windows overlapping this interval are returned
 * @param params.serviceType - Service type used to filter service-scoped Slots; Slots without a serviceType apply to all services
 * @returns The windows overlapping `range`, unclipped, in order
 */
export function resolveAnchoredWindows(params: {
  parameters: LayeredDict<SchedulingParameters>;
  timezone: string;
  slots: Slot[];
  range: Interval;
  serviceType?: readonly CodeableConcept[];
}): AnchoredWindow[] {
  const freeIntervals = params.slots
    .filter((slot) => slot.status === 'free')
    .filter((slot) => hasMatchingServiceType(slot, params.serviceType ?? EMPTY))
    .map((slot) => slotToInterval(slot));

  const blocks = localDaysTouching(
    {
      start: earliest([params.range.start, ...freeIntervals.map((interval) => interval.start)]),
      end: latest([params.range.end, ...freeIntervals.map((interval) => interval.end)]),
    },
    params.timezone
  ).flatMap((dayStart) => normalizeIntervals(availabilityOnDay(params.parameters, dayStart)));
  const anchors = blocks.map((block) => block.start).sort((a, b) => a.valueOf() - b.valueOf());

  return normalizeIntervals([...blocks, ...freeIntervals])
    .filter((window) => areIntervalsOverlapping(window, params.range))
    .map((window) => ({
      ...window,
      anchors: anchors.filter((anchor) => window.start <= anchor && anchor < window.end),
    }));
}

/**
 * Returns the instant the alignment grid is counted from for a candidate start time: the latest
 * anchor at or before it in its window, else the window's first anchor (the grid counts backward
 * from it), else the window's own start.
 *
 * @param windows - Windows from `resolveAnchoredWindows`
 * @param start - The candidate start time
 * @returns The anchor, or undefined when `start` is outside every window
 */
export function findAnchor(windows: AnchoredWindow[], start: Date): Date | undefined {
  const window = windows.find((w) => w.start <= start && start < w.end);
  if (!window) {
    return undefined;
  }
  return window.anchors.findLast((anchor) => anchor <= start) ?? window.anchors[0] ?? window.start;
}

// Every local day containing part of `interval`, its end included, plus the day before so hours
// that cross midnight into it are found.
function localDaysTouching(interval: Interval, timezone: string): Temporal.ZonedDateTime[] {
  const firstDay = Temporal.Instant.fromEpochMilliseconds(interval.start.valueOf())
    .toZonedDateTimeISO(timezone)
    .startOfDay()
    .subtract({ days: 1 })
    .startOfDay();
  return eachDayOfInterval(
    { start: new Date(firstDay.epochMilliseconds), end: new Date(interval.end.valueOf() + 1) },
    timezone
  );
}
