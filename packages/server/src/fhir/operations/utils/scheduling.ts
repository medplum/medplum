// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  EMPTY,
  getExtensionValue,
  getReferenceString,
  isDefined,
  isResource,
  OperationOutcomeError,
  Operator,
  resolveId,
} from '@medplum/core';
import type {
  Appointment,
  Bundle,
  CodeableConcept,
  HealthcareService,
  Reference,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import assert from 'node:assert';
import { Temporal } from 'temporal-polyfill';
import type { Interval } from '../../../util/date';
import { areIntervalsOverlapping, clamp, earliest, latest } from '../../../util/date';
import { extractReferencesFromCodeableReferenceLike } from '../../../util/servicetype';
import type { WithPath } from '../../../util/withpath';
import { copyPaths, filterWithPaths, getPath, withPath } from '../../../util/withpath';
import type { Repository } from '../../repo';
import type { SchedulingParameters } from './scheduling-parameters';
import { chooseSchedulingParameterGroup } from './scheduling-parameters';
import { uniqueOn } from './terminology';

// Tricky: support zero-based and one-based indexing by including Sunday on both ends.
// (Date#getDay() uses zero-based indexing and Temporal#dayOfWeek uses one-based indexing)
type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const dayNames: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function eachDayOfInterval(interval: Interval, timeZone: string): Temporal.ZonedDateTime[] {
  let t = Temporal.Instant.fromEpochMilliseconds(interval.start.valueOf())
    .toZonedDateTimeISO(timeZone)
    .withPlainTime({ hour: 0, minute: 0, second: 0, millisecond: 0 });

  const results: Temporal.ZonedDateTime[] = [];
  while (t.epochMilliseconds < interval.end.valueOf()) {
    results.push(t);
    t = t.add({ days: 1 });
  }
  return results;
}

function hasMatchingServiceType(slot: Slot, concepts: readonly CodeableConcept[]): boolean {
  const serviceType = slot.serviceType ?? [];
  // Slots without any service type are considered as "wildcard" slots that support
  // any service type codes
  if (serviceType.length === 0) {
    return true;
  }

  // If we didn't get a specific concept to test for, we should only match wildcard slots,
  // which we ruled out above.
  if (concepts.length === 0) {
    return false;
  }

  const codes = new Set(
    concepts.flatMap((concept) =>
      (concept.coding ?? EMPTY).map((coding) => `${coding.system ?? ''}|${coding.code ?? ''}`)
    )
  );

  // Check if there any of the Slot's service type codes match the input code
  for (const codeableConcept of serviceType) {
    if (codeableConcept.coding?.some((c) => codes.has(`${c.system ?? ''}|${c.code ?? ''}`))) {
      return true;
    }
  }
  return false;
}

export const TimezoneExtensionURI = 'http://hl7.org/fhir/StructureDefinition/timezone';

/**
 * Given a Resource, try to identify a relevant time zone from its extensions.
 * See https://build.fhir.org/ig/HL7/fhir-extensions/StructureDefinition-timezone.html
 *
 * @param resource - The Resource to examing
 * @returns string | undefined - The contents of the timezone extension
 */
export function getTimeZone(resource: Resource): string | undefined {
  return getExtensionValue(resource, TimezoneExtensionURI) as string | undefined;
}

/**
 * Given two intervals, return the interval that overlaps both of them. Returns undefined
 * if the intervals don't overlap at all.
 *
 * @param left - The first interval to consider
 * @param right - The second interval to consider
 * @returns An overlap interval, or undefined if none exists
 */
export function intersectIntervals(left: Interval, right: Interval): Interval | undefined {
  if (!areIntervalsOverlapping(left, right)) {
    return undefined;
  }

  return { start: clamp(left.start, right), end: clamp(left.end, right) };
}

/**
 * Given two intervals, return the interval that overlaps either of them.
 * Returns undefined if the intervals don't overlap at all.
 *
 * @param left - The first interval to consider
 * @param right - The second interval to consider
 * @returns An overlap interval, or undefined if none exists
 */
function mergeIntervals(left: Interval, right: Interval): Interval | undefined {
  if (!areIntervalsOverlapping(left, right, { inclusive: true })) {
    return undefined;
  }

  const start = left.start.valueOf() < right.start.valueOf() ? left.start : right.start;
  const end = left.end.valueOf() > right.end.valueOf() ? left.end : right.end;

  return { start, end };
}

/**
 * Returns intervals of availability from a SchedulingParameters definition and a range of time
 *
 * @param schedulingParameters - The SchedulingParameters definition to evaluate
 * @param interval - The Interval to return availability within
 * @param timeZone - The timezone to apply availability based on
 * @returns An array of intervals of availability
 */
export function resolveAvailability(
  schedulingParameters: SchedulingParameters,
  interval: Interval,
  timeZone: string
): Interval[] {
  return eachDayOfInterval(interval, timeZone).flatMap((dayStart) => {
    const dayOfWeek = dayNames[dayStart.dayOfWeek];
    return schedulingParameters.availability
      .filter((availability) => availability.dayOfWeek.includes(dayOfWeek))
      .map((availability) => {
        const [sH, sM, sS] = availability.availableStartTime.split(':').map(Number);
        const [eH, eM, eS] = availability.availableEndTime.split(':').map(Number);
        const start = dayStart.withPlainTime({ hour: sH, minute: sM, second: sS });
        let end = dayStart.withPlainTime({ hour: eH, minute: eM, second: eS });
        if (end.epochMilliseconds <= start.epochMilliseconds) {
          end = end.add({ days: 1 });
        }
        const availableInterval = { start: new Date(start.epochMilliseconds), end: new Date(end.epochMilliseconds) };
        return intersectIntervals(availableInterval, interval);
      })
      .filter(isDefined);
  });
}

/**
 * Normalize a group of intervals for usage in resolution
 * - Sorts intervals by start time
 * - Merges overlapping intervals into a continuous interval
 *
 * @param intervals - The array of intervals to normalize
 * @returns An array of normalized intervals
 */
export function normalizeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length < 2) {
    return intervals;
  }
  const sorted = intervals.concat().sort((a, b) => a.start.valueOf() - b.start.valueOf());
  return sorted.reduce<Interval[]>((acc, interval) => {
    const last = acc.at(-1);

    // base case: push the first interval onto the accumulator.
    if (!last) {
      return [interval];
    }

    // Try to merge the current interval into the last one seen
    const merged = mergeIntervals(last, interval);
    if (merged) {
      // Overlap found: update the last entry with the merged value
      acc[acc.length - 1] = merged;
    } else {
      // No overlap; append interval to end
      acc.push(interval);
    }
    return acc;
  }, []);
}

/**
 * Linearly iterates over two normalized interval lists, returning each interval from listA
 * paired with all overlapping intervals from listB. Each interval in listA is returned exactly
 * once. Intervals in listB may be part of zero, one, or many result lists.
 *
 * @param listA - First normalized (sorted, non-overlapping) list of intervals
 * @param listB - Second normalized (sorted, non-overlapping) list of intervals
 * @returns An array of pairs, each containing an interval from listA and its overlapping intervals from listB
 */
export function pairWithOverlaps(listA: Interval[], listB: Interval[]): [Interval, Interval[]][] {
  const result: [Interval, Interval[]][] = [];
  let indexB = 0;

  for (const a of listA) {
    // Skip intervals in listB that end before a starts
    while (indexB < listB.length && listB[indexB].end <= a.start) {
      indexB++;
    }

    // Collect all overlapping intervals from listB, tracking where to resume for the next `a`
    const overlaps: Interval[] = [];
    let nextStartIndex = indexB;
    for (let i = indexB; i < listB.length && listB[i].start < a.end; i++) {
      overlaps.push(listB[i]);
      if (listB[i].end <= a.end) {
        // This interval is fully consumed by `a`, so future iterations can skip it
        nextStartIndex = i + 1;
      }
    }

    indexB = nextStartIndex;

    result.push([a, overlaps]);
  }

  return result;
}

/**
 * @param availableIntervals - normalized (sorted, non-overlapping) intervals of available time
 * @param blockedIntervals - normalized (sorted, non-overlapping) intervals of blocked time
 * @returns Intervals of remaining available time after blocks are excluded
 */
export function removeAvailability(availableIntervals: Interval[], blockedIntervals: Interval[]): Interval[] {
  if (blockedIntervals.length === 0) {
    return availableIntervals;
  }

  const result: Interval[] = [];

  for (const [available, blocks] of pairWithOverlaps(availableIntervals, blockedIntervals)) {
    let currentStart = available.start;

    for (const blocked of blocks) {
      if (currentStart < blocked.start) {
        result.push({ start: currentStart, end: blocked.start });
      }
      if (blocked.end.valueOf() > currentStart.valueOf()) {
        currentStart = blocked.end;
      }
    }

    if (currentStart < available.end) {
      result.push({ start: currentStart, end: available.end });
    }
  }

  return result;
}

/**
 * Applies overrides from existing Slots to an availability window
 *
 * @param params - input object
 * @param params.availability - Ranges of available time
 * @param params.slots - Slot resources to consider
 * @param params.range - Interval of time to restrict availability to
 * @param params.serviceType - Service type to check for "free" slots
 * @returns Updated availability information
 */
export function applyExistingSlots(params: {
  availability: Interval[];
  slots: Slot[];
  range: Interval;
  serviceType?: readonly CodeableConcept[];
}): Interval[] {
  const freeSlotIntervals = params.slots
    .filter((slot) => slot.status === 'free')
    .filter((slot) => hasMatchingServiceType(slot, params.serviceType ?? EMPTY))
    .map((slot) => intersectIntervals({ start: new Date(slot.start), end: new Date(slot.end) }, params.range))
    .filter(isDefined);

  const busySlotIntervals = normalizeIntervals(
    params.slots
      .filter(
        (slot) => slot.status === 'busy' || slot.status === 'busy-unavailable' || slot.status === 'busy-tentative'
      )
      .map((slot) => ({ start: new Date(slot.start), end: new Date(slot.end) }))
  );
  const allAvailability = normalizeIntervals(params.availability.concat(freeSlotIntervals));
  return removeAvailability(allAvailability, busySlotIntervals);
}

export function assertAllLoaded<T extends Resource>(
  objects: WithPath<T | Error>[],
  message: string
): asserts objects is WithPath<T>[] {
  const invalid = objects.find((obj) => !isResource(obj));
  if (invalid) {
    throw new OperationOutcomeError(badRequest(message, getPath(invalid)));
  }
}

export async function getSchedulingParametersGroup(
  repo: Repository,
  schedules: WithPath<WithId<Schedule>>[],
  healthcareService: WithPath<WithId<HealthcareService>>
): Promise<Map<WithPath<WithId<Schedule>>, WithPath<SchedulingParameters & { timezone: string }>>> {
  schedules.forEach((schedule) => {
    if (schedule.actor.length !== 1) {
      throw new OperationOutcomeError(
        badRequest('Scheduling only supported on schedules with exactly one actor', getPath(schedule))
      );
    }
  });

  const actors = await repo
    .readReferences(schedules.map((schedule) => schedule.actor[0]))
    .then((actors) => copyPaths(schedules, actors, { suffix: '.actor[0]' }));
  assertAllLoaded(actors, 'Loading schedule.actor failed');

  const group = chooseSchedulingParameterGroup(schedules, healthcareService);

  return new Map(
    group.entries().map(([schedule, parameters], idx) => {
      const actor = actors[idx];
      assert(actor);
      const timezone = parameters.timezone ?? getTimeZone(actor);
      if (!timezone) {
        throw new OperationOutcomeError(badRequest('No timezone specified', getPath(actor)));
      }
      return [schedule, { ...parameters, timezone }];
    })
  );
}

// Finds keys that can be used to index into `T` and yield a primitive type
// that can be compared with strict equality.
type PrimitiveKey<T> = {
  [K in keyof T]-?: T[K] extends string | number | boolean | undefined ? K : never;
}[keyof T];

export function assertAllMatch<T extends object>(
  objects: WithPath<T>[],
  attribute: PrimitiveKey<T> & string,
  msg: string
): void {
  if (objects.length <= 1) {
    return;
  }
  const mismatched = objects.find((value) => value[attribute] !== objects[0][attribute]);
  if (mismatched) {
    throw new OperationOutcomeError(
      badRequest(msg, [`${getPath(objects[0])}.${attribute}`, `${getPath(mismatched)}.${attribute}`])
    );
  }
}

export async function slotsOverlappingInterval(
  repo: Repository,
  schedules: (WithId<Schedule> | (Reference<Schedule> & { reference: string }))[],
  interval: Interval
): Promise<Slot[]> {
  const searchStart = interval.start.toISOString();
  const searchEnd = interval.end.toISOString();
  const results = await repo.searchResources<Slot>({
    resourceType: 'Slot',
    count: DEFAULT_MAX_SEARCH_COUNT,
    filters: [
      {
        code: 'schedule',
        operator: Operator.EQUALS,
        value: schedules.map((schedule) => getReferenceString(schedule)).join(','),
      },
      {
        code: 'status',
        operator: Operator.EQUALS,
        value: 'busy,busy-tentative,busy-unavailable,free',
      },
      {
        code: '_filter',
        operator: Operator.EQUALS,
        value: `((start ge "${searchStart}" and start le "${searchEnd}") or (end ge "${searchStart}" and end le "${searchEnd}") or (start lt "${searchStart}" and end gt "${searchEnd}"))`,
      },
    ],
  });

  // If we filled a full search page of slots, then there may be slots we
  // didn't fetch that would impact availability. Fail loudly here.
  if (results.length === DEFAULT_MAX_SEARCH_COUNT) {
    throw new OperationOutcomeError(badRequest('Too many slots found in range; try searching with smaller bounds'));
  }
  return results;
}

// Ensures that the input slots match our scheduling parameter constraints
//
// Intentionally skipped for now: testing parameters.alignmentInterval and
// parameters.alignmentOffset. See https://github.com/medplum/medplum/pull/8331.
function validateSlots(slots: WithPath<Slot>[], parameters: SchedulingParameters): void {
  // Expect exactly one 'busy' slot with duration matching parameters.duration
  const busySlots = slots.filter((slot) => slot.status === 'busy');
  if (busySlots.length !== 1) {
    throw new OperationOutcomeError(
      badRequest(
        `Expected exactly one 'busy' slot per schedule`,
        slots.map((slot) => getPath(slot))
      )
    );
  }
  const busySlot = busySlots[0];
  const busyDurationMinutes = (new Date(busySlot.end).getTime() - new Date(busySlot.start).getTime()) / 60_000;
  if (busyDurationMinutes !== parameters.duration) {
    throw new OperationOutcomeError(
      badRequest('Slot duration does not match scheduling parameters duration', getPath(busySlot))
    );
  }

  const busyStartMs = new Date(busySlot.start).getTime();
  const busyEndMs = new Date(busySlot.end).getTime();

  // If bufferBefore is set, expect one 'busy-unavailable' slot ending at the start of the busy slot
  if (parameters.bufferBefore > 0) {
    const bufferBeforeSlots = slots.filter(
      (slot) => slot.status === 'busy-unavailable' && new Date(slot.end).getTime() === busyStartMs
    );
    if (bufferBeforeSlots.length !== 1) {
      throw new OperationOutcomeError(
        badRequest(
          "Expected exactly one 'busy-unavailable' slot ending at the start of the busy slot (bufferBefore)",
          getPath(busySlot)
        )
      );
    }
    const bufferBeforeSlot = bufferBeforeSlots[0];
    const bufferBeforeDurationMinutes =
      (new Date(bufferBeforeSlot.end).getTime() - new Date(bufferBeforeSlot.start).getTime()) / 60_000;
    if (bufferBeforeDurationMinutes !== parameters.bufferBefore) {
      throw new OperationOutcomeError(
        badRequest(
          `Buffer-before slot duration (${bufferBeforeDurationMinutes} min) does not match scheduling parameters bufferBefore (${parameters.bufferBefore} min)`,
          getPath(bufferBeforeSlot)
        )
      );
    }
  }

  // If bufferAfter is set, expect one 'busy-unavailable' slot starting at the end of the busy slot
  if (parameters.bufferAfter > 0) {
    const bufferAfterSlots = slots.filter(
      (slot) => slot.status === 'busy-unavailable' && new Date(slot.start).getTime() === busyEndMs
    );
    if (bufferAfterSlots.length !== 1) {
      throw new OperationOutcomeError(
        badRequest(
          "Expected exactly one 'busy-unavailable' slot starting at the end of the busy slot (bufferAfter)",
          getPath(busySlot)
        )
      );
    }
    const bufferAfterSlot = bufferAfterSlots[0];
    const bufferAfterDurationMinutes =
      (new Date(bufferAfterSlot.end).getTime() - new Date(bufferAfterSlot.start).getTime()) / 60_000;
    if (bufferAfterDurationMinutes !== parameters.bufferAfter) {
      throw new OperationOutcomeError(
        badRequest(
          `Buffer-after slot duration (${bufferAfterDurationMinutes} min) does not match scheduling parameters bufferAfter (${parameters.bufferAfter} min)`,
          getPath(bufferAfterSlot)
        )
      );
    }
  }
}

async function validateAvailability(
  repo: Repository,
  healthcareService: HealthcareService,
  schedule: WithId<Schedule>,
  parameters: SchedulingParameters & { timezone: string },
  interval: Interval
): Promise<void> {
  const existingSlots = await slotsOverlappingInterval(repo, [schedule], interval);
  let availability = resolveAvailability(parameters, interval, parameters.timezone);
  availability = applyExistingSlots({
    availability,
    slots: existingSlots,
    range: interval,
    serviceType: healthcareService.type,
  });
  const hasAvailability = availability.some((avail) => avail.start <= interval.start && avail.end >= interval.end);
  if (!hasAvailability) {
    // TODO: tie back to specific slot that has problem
    throw new OperationOutcomeError(badRequest('Requested time slot is not available'));
  }
}

export async function validateProposedAppointment(
  repo: Repository,
  proposedAppointment: WithPath<Appointment>
): Promise<
  [
    Appointment,
    WithPath<Slot>[],
    HealthcareService,
    Map<WithPath<WithId<Schedule>>, WithPath<SchedulingParameters & { timezone: string }>>,
  ]
> {
  const { contained, ...appointment } = proposedAppointment;
  const serviceRefs = extractReferencesFromCodeableReferenceLike(appointment.serviceType);
  if (serviceRefs.length === 0) {
    throw new OperationOutcomeError(
      badRequest('Appointment has no service reference', 'Parameters.appointment.serviceType')
    );
  }
  if (serviceRefs.length > 1) {
    throw new OperationOutcomeError(
      badRequest('Appointment has too many service references', 'Parameters.appointment.serviceType')
    );
  }

  const proposedSlots = filterWithPaths(
    contained,
    (r) => isResource<Slot>(r, 'Slot'),
    `${getPath(proposedAppointment)}.contained`
  );
  if (!proposedSlots.length) {
    throw new OperationOutcomeError(
      badRequest('Appointment has no contained Slot resources', 'Parameters.appointment')
    );
  }

  const busySlots = proposedSlots.filter((slot) => slot.status === 'busy');
  assertAllMatch(busySlots, 'start', 'Mismatched slot start times');
  assertAllMatch(busySlots, 'end', 'Mismatched slot end times');

  const scheduleRefs = uniqueOn(
    proposedSlots.map((slot) => withPath(slot.schedule, `${getPath(slot)}.schedule`)),
    (ref) => {
      if (!ref.reference) {
        throw new OperationOutcomeError(badRequest('Slot missing schedule reference', getPath(ref)));
      }
      return ref.reference;
    }
  );

  const [schedules, healthcareService] = await Promise.all([
    repo.readReferences(scheduleRefs).then((schedules) => copyPaths(scheduleRefs, schedules)),
    repo.readReference(serviceRefs[0]).then((service) => withPath(service, 'HealthcareService')),
  ]);
  assertAllLoaded(schedules, 'Schedule load failed');

  const schedulingParameterGroup = await getSchedulingParametersGroup(repo, schedules, healthcareService);

  // Check that scheduling parameters match proposedSlots
  for (const schedule of schedules) {
    const parameters = schedulingParameterGroup.get(schedule);
    assert(parameters);

    const slotsForSchedule = proposedSlots.filter((slot) => resolveId(slot.schedule) === schedule.id);
    validateSlots(slotsForSchedule, parameters);
  }

  return [appointment, proposedSlots, healthcareService, schedulingParameterGroup];
}

export async function validateAllAvailability(
  repo: Repository,
  allSlots: WithPath<Slot>[],
  healthcareService: HealthcareService,
  schedulingParameterGroup: Map<WithPath<WithId<Schedule>>, WithPath<SchedulingParameters & { timezone: string }>>
): Promise<void> {
  const groupedSlots = Object.groupBy(allSlots, (slot) => slot.schedule.reference ?? 'unknown');
  for (const [schedule, parameters] of schedulingParameterGroup.entries()) {
    const refstr = getReferenceString(schedule);
    const slots = groupedSlots[refstr];
    delete groupedSlots[refstr];
    assert(slots);
    const start = earliest(slots.map((slot) => new Date(slot.start)));
    const end = latest(slots.map((slot) => new Date(slot.end)));
    assert(start && end);
    const interval = { start, end };
    await validateAvailability(repo, healthcareService, schedule, parameters, interval);
  }

  // Any unprocessed slots represent some kind of error
  const unprocessedSlots = Object.values(groupedSlots).flat().filter(isDefined);
  if (unprocessedSlots.length) {
    throw new OperationOutcomeError(
      badRequest(
        'Got slots that did not map to scheduling parameters',
        unprocessedSlots.map((slot) => getPath(slot))
      )
    );
  }
}

export async function createProposedAppointment(
  repo: Repository,
  proposedAppointment: WithPath<Appointment>,
  customizer: (appointment: Appointment, slots: Slot[]) => void
): Promise<Bundle<Appointment | Slot>> {
  const [appointment, slots, healthcareService, schedulingParametersGroup] = await validateProposedAppointment(
    repo,
    proposedAppointment
  );

  // We will write this attribute later, check that we aren't clobbering something that was submitted
  if (appointment.slot) {
    throw new OperationOutcomeError(
      badRequest('Proposed appointment must not have Slot references', `${getPath(proposedAppointment)}.slot`)
    );
  }

  customizer(appointment, slots);

  const createdResources = await repo.withTransaction(
    async (txRepo) => {
      await validateAllAvailability(txRepo, slots, healthcareService, schedulingParametersGroup);
      const createdSlots = await Promise.all(slots.map((slot) => txRepo.createResource<Slot>(slot)));
      const createdAppointment = await txRepo.createResource<Appointment>({
        ...appointment,
        slot: createdSlots.map((slot) => createReference(slot)),
      });
      return [createdAppointment, ...createdSlots];
    },
    { serializable: true }
  );

  return {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: createdResources.map((resource) => ({ resource })),
  };
}
