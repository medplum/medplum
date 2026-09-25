// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  arrayify,
  badRequest,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  isDefined,
  isNotFound,
  isReference,
  OperationOutcomeError,
  resolveId,
  serviceTypeIncludesService,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Appointment,
  Bundle,
  CodeableConcept,
  HealthcareService,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import assert from 'node:assert';
import { getAuthenticatedContext } from '../../context';
import { flatMapMax } from '../../util/array';
import type { Interval } from '../../util/date';
import { addMinutes, earliest, latest } from '../../util/date';
import type { LayeredDict } from '../../util/layereddict';
import type { WithPath } from '../../util/withpath';
import { copyPaths, getPath, withPath, withPaths } from '../../util/withpath';
import { makeOperationDefinition } from './definitions';
import { bufferTimeConflicts, findAlignedSlotTimes, overlappingIntervals } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { seriesTimezone, weekProjector } from './utils/recurrence';
import {
  applyExistingSlots,
  assertAllLoaded,
  buildAppointmentSlots,
  getSchedulingParametersGroup,
  intervalsExceedingCapacity,
  isAlignedToGrid,
  resolveAvailability,
  slotsOverlappingInterval,
} from './utils/scheduling';
import type { SchedulingParameters } from './utils/scheduling-parameters';
import { extractCommonParameters } from './utils/scheduling-parameters';

const appointmentFindOperation = makeOperationDefinition(
  { scope: 'type', resource: 'Appointment' },
  {
    name: 'find',
    code: 'find',
    parameter: [
      { use: 'in', name: 'start', type: 'dateTime', min: 1, max: '1' },
      { use: 'in', name: 'end', type: 'dateTime', min: 1, max: '1' },
      { use: 'in', name: 'service-type-reference', type: 'string', min: 1, max: '1', searchType: 'reference' },
      { use: 'in', name: 'schedule', type: 'string', min: 1, max: '*', searchType: 'reference' },
      { use: 'in', name: 'ignore-appointment', type: 'string', min: 0, max: '1', searchType: 'reference' },
      { use: 'in', name: 'occurrence-count', type: 'positiveInt', min: 0, max: '1' },
      { use: 'in', name: '_count', type: 'integer', min: 0, max: '1' },
      { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
    ],
  }
);

type AppointmentFindParameters = {
  start: string;
  end: string;
  'service-type-reference': string;
  schedule: string | string[];
  'ignore-appointment'?: string;
  'occurrence-count'?: number;
  _count?: number;
};

const MAX_OCCURRENCE_COUNT = 6;

// The range-independent half of availability. Loading it costs 2N+2 quota-charged, audit-logged
// reads for N schedules, so a search over several weeks loads it once.
type SchedulingContext = {
  schedules: WithPath<WithId<Schedule>>[];
  healthcareService: WithId<HealthcareService>;
  parameterGroup: Map<WithPath<WithId<Schedule>>, LayeredDict<SchedulingParameters & { timezone: string }>>;
  commonParameters: Pick<
    SchedulingParameters,
    'duration' | 'alignmentInterval' | 'alignmentOffset' | 'alignmentTimezone'
  >;
  serviceType: CodeableConcept[];
};

async function loadSchedulingContext(params: {
  schedules: WithPath<Reference<Schedule> & { reference: string }>[];
  healthcareService: Reference<HealthcareService> & { reference: string };
}): Promise<SchedulingContext> {
  const ctx = getAuthenticatedContext();

  const [schedules, healthcareService] = await Promise.all([
    ctx.repo.readReferences(params.schedules).then((schedules) => copyPaths(params.schedules, schedules)),
    ctx.repo.readReference<HealthcareService>(params.healthcareService).catch((err) => {
      if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
        throw new OperationOutcomeError(badRequest('HealthcareService not found'));
      }
      throw err;
    }),
  ]);
  assertAllLoaded(schedules, 'Loading schedule failed');

  const parameterGroup = await getSchedulingParametersGroup(
    ctx.repo,
    schedules,
    withPath(healthcareService, 'Parameters.service-type-reference')
  );

  schedules.forEach((schedule) => {
    if (!serviceTypeIncludesService(schedule.serviceType, healthcareService)) {
      throw new OperationOutcomeError(
        badRequest('Schedule is not schedulable for requested service type', getPath(schedule))
      );
    }
  });

  return {
    schedules,
    healthcareService,
    parameterGroup,
    commonParameters: extractCommonParameters([...parameterGroup.values()]),
    serviceType: toServiceTypeCodeableConcepts(healthcareService),
  };
}

// Clamps a range to every schedule's `planningHorizon`.
function resolveEffectiveRange(context: SchedulingContext, requestedRange: Interval): Interval {
  const effectiveRange = { start: requestedRange.start, end: requestedRange.end };

  for (const schedule of context.schedules) {
    if (schedule.planningHorizon?.start) {
      const horizonStart = new Date(schedule.planningHorizon.start);
      if (effectiveRange.end < horizonStart) {
        throw new OperationOutcomeError(
          badRequest('Search range ends before schedule planning horizon starts', getPath(schedule))
        );
      }
      effectiveRange.start = latest([effectiveRange.start, horizonStart]);
    }

    if (schedule.planningHorizon?.end) {
      const horizonEnd = new Date(schedule.planningHorizon.end);
      if (effectiveRange.start > horizonEnd) {
        throw new OperationOutcomeError(
          badRequest('Search range starts after schedule planning horizon ends', getPath(schedule))
        );
      }
      effectiveRange.end = earliest([effectiveRange.end, horizonEnd]);
    }
  }

  return effectiveRange;
}

// The time an appointment can occupy within a horizon-clamped range, and a check for whether its
// buffers would land on an existing booking, computed without database access.
function computeAvailability(params: { context: SchedulingContext; effectiveRange: Interval; slots: Slot[] }): {
  availability: Interval[];
  hasBufferConflict: (interval: Interval) => boolean;
} {
  const { context, effectiveRange, slots } = params;
  const slotsBySchedule = Map.groupBy(slots, (slot) => resolveId(slot.schedule));

  const allAvailability = context.schedules.map((schedule) => {
    const schedulingParameters = context.parameterGroup.get(schedule);
    assert(schedulingParameters);

    const scheduleSlots = slotsBySchedule.get(schedule.id) ?? [];
    let availability = resolveAvailability(schedulingParameters, effectiveRange, schedulingParameters.get('timezone'));
    availability = applyExistingSlots({
      availability,
      slots: scheduleSlots,
      range: effectiveRange,
      serviceType: context.healthcareService.type,
      capacity: schedulingParameters.get('slotCapacity'),
    });

    // Trim off bufferBefore/bufferAfter from availability
    availability = availability.map((interval) => ({
      start: addMinutes(interval.start, schedulingParameters.get('bufferBefore')),
      end: addMinutes(interval.end, -1 * schedulingParameters.get('bufferAfter')),
    }));

    // Optimization: restrict to windows long enough for the requested duration
    // here before trying to do intersections with other schedules later. This
    // also ensures that we don't return intervals having an `end` before the
    // `start` after our previous buffer-trimming step.
    availability = availability.filter((interval) => {
      const durationMs = interval.end.getTime() - interval.start.getTime();
      return durationMs >= schedulingParameters.get('duration') * 60 * 1000;
    });

    return availability;
  });

  const intersectingAvailability = allAvailability
    .slice(1)
    .reduce((acc, val) => overlappingIntervals(acc, val), allAvailability[0]);
  assert(intersectingAvailability);

  // Tricky: `slotCapacity` lets an appointment overlap existing bookings, but its buffer
  // time is exclusive — it is blocked by any existing booking, even one the appointment
  // itself is allowed to overlap. Availability above is resolved at the appointment's own
  // capacity, so buffers are checked against exclusively occupied time per candidate.
  //
  // Only schedules that allow overbooking need the check. At `slotCapacity` 1 the
  // availability above already excludes every existing booking, and each candidate's
  // buffers land inside the single availability window it was trimmed from, so the
  // check could never reject a candidate.
  const bufferChecks = context.schedules
    .map((schedule) => {
      const schedulingParameters = context.parameterGroup.get(schedule);
      assert(schedulingParameters);
      const bufferBefore = schedulingParameters.get('bufferBefore');
      const bufferAfter = schedulingParameters.get('bufferAfter');
      if (schedulingParameters.get('slotCapacity') === 1 || (bufferBefore === 0 && bufferAfter === 0)) {
        return undefined;
      }
      const scheduleSlots = slotsBySchedule.get(schedule.id) ?? [];
      return { blocked: intervalsExceedingCapacity(scheduleSlots, 1), bufferBefore, bufferAfter };
    })
    .filter(isDefined);

  return {
    availability: intersectingAvailability,
    hasBufferConflict: (interval) => bufferChecks.some((check) => bufferTimeConflicts(interval, check.blocked, check)),
  };
}

// The first `maxCount` bookable intervals within a horizon-clamped range.
function computeAlignedIntervals(params: {
  context: SchedulingContext;
  effectiveRange: Interval;
  slots: Slot[];
  maxCount: number;
}): Interval[] {
  const { availability, hasBufferConflict } = computeAvailability(params);
  const { alignmentInterval, alignmentOffset, alignmentTimezone, duration } = params.context.commonParameters;
  const alignment = { interval: alignmentInterval, offset: alignmentOffset, timezone: alignmentTimezone };
  const filter = (candidate: Interval): boolean => !hasBufferConflict(candidate);

  return flatMapMax(
    availability,
    (interval, _idx, maxCount) =>
      findAlignedSlotTimes(interval, { alignment, durationMinutes: duration, maxCount, filter }),
    params.maxCount
  );
}

function buildAppointments(context: SchedulingContext, intervals: Interval[]): Appointment[] {
  return intervals.map((interval) => {
    const start = interval.start.toISOString();
    const end = interval.end.toISOString();

    const slots = context.schedules.flatMap((schedule) => {
      const parameters = context.parameterGroup.get(schedule);
      assert(parameters);
      return buildAppointmentSlots({ schedule, parameters, interval });
    });

    const participant = context.schedules.flatMap((schedule) =>
      schedule.actor.map(
        (actor) =>
          ({
            actor,
            required: 'required',
            status: 'needs-action',
          }) as const
      )
    );

    const appointment = {
      resourceType: 'Appointment',
      start,
      end,
      status: 'proposed',
      serviceType: context.serviceType,
      participant,
      contained: slots,
    } satisfies Appointment;

    return appointment;
  });
}

// Bounds the Slots one search pulls in, which `slotsOverlappingInterval` fetches in one capped query.
const MAX_FIND_RANGE_DAYS = 31;

// Every later week of a series is searched over a window as wide as the first, so this bounds each
// of those Slot queries too.
const MAX_RECURRING_RANGE_DAYS = 7;

// Whole local days run up to an hour longer across a DST transition, and still count as whole days.
const DST_SLACK_MINUTES = 60;

// The time the candidates' projections, `weeksForward` weeks out, occupy with their buffers. Any
// narrower, and availability clipped at its edge would reject a projection the first week accepted.
function projectedWeekWindow(
  context: SchedulingContext,
  candidates: Interval[],
  project: (anchor: Date) => Date | undefined
): Interval | undefined {
  const projections = candidates.map((candidate) => project(candidate.start)).filter(isDefined);
  const first = earliest(projections);
  const last = latest(projections);
  if (!first || !last) {
    return undefined;
  }
  const parameters = [...context.parameterGroup.values()];
  const bufferBefore = Math.max(...parameters.map((p) => p.get('bufferBefore')));
  const bufferAfter = Math.max(...parameters.map((p) => p.get('bufferAfter')));
  return {
    start: addMinutes(first, -bufferBefore),
    end: addMinutes(last, context.commonParameters.duration + bufferAfter),
  };
}

// Internal implementation of $find logic. A single time is a series of one. A first-occurrence
// candidate survives each later week only if its projection is available that week; each later
// week costs one Slot search, so DB work scales with `occurrenceCount`, not with candidates.
async function findAvailableSeries(params: {
  schedules: WithPath<Reference<Schedule> & { reference: string }>[];
  healthcareService: Reference<HealthcareService> & { reference: string };
  ignoreAppointment?: WithPath<Reference<Appointment>> & { reference: string };
  start: string;
  end: string;
  occurrenceCount: number;
  _count?: number;
}): Promise<Appointment[][]> {
  const ctx = getAuthenticatedContext();
  const { ignoreAppointment, occurrenceCount } = params;

  const pageSize = params._count ?? DEFAULT_SEARCH_COUNT;
  if (pageSize < 1) {
    throw new OperationOutcomeError(badRequest('Invalid _count, minimum required is 1'));
  }
  if (pageSize > DEFAULT_MAX_SEARCH_COUNT) {
    throw new OperationOutcomeError(badRequest(`Invalid _count, maximum allowed is ${DEFAULT_MAX_SEARCH_COUNT}`));
  }

  const requestedRange = { start: new Date(params.start), end: new Date(params.end) };
  if (requestedRange.start >= requestedRange.end) {
    throw new OperationOutcomeError(badRequest('Invalid search time range'));
  }

  const maxDays = occurrenceCount > 1 ? MAX_RECURRING_RANGE_DAYS : MAX_FIND_RANGE_DAYS;
  if (requestedRange.end > addMinutes(requestedRange.start, maxDays * 24 * 60 + DST_SLACK_MINUTES)) {
    throw new OperationOutcomeError(badRequest(`Search range cannot exceed ${maxDays} days`));
  }

  const [context, allExistingSlots, ignoredAppointment] = await Promise.all([
    loadSchedulingContext({ schedules: params.schedules, healthcareService: params.healthcareService }),
    slotsOverlappingInterval(ctx.repo, params.schedules, requestedRange),
    ignoreAppointment
      ? ctx.repo.readReference<Appointment>(ignoreAppointment).catch((err) => {
          if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
            throw new OperationOutcomeError(badRequest('Appointment not found', getPath(ignoreAppointment)));
          }
          throw err;
        })
      : undefined,
  ]);

  const effectiveRange = resolveEffectiveRange(context, requestedRange);

  // The Slots held by the appointment being reassigned shouldn't block that appointment from
  // moving, so drop them before computing availability.
  const ignoredSlotIds = new Set((ignoredAppointment?.slot ?? []).map((ref) => resolveId(ref)).filter(isDefined));
  const existingSlots = allExistingSlots.filter((slot) => !ignoredSlotIds.has(slot.id));

  // The timezone a series keeps its local time in. A single time never projects forward, so only a
  // series needs its schedules to share one. Checked before the search, so that is never skipped.
  const parameters = [...context.parameterGroup.values()];
  const timezone = occurrenceCount > 1 ? seriesTimezone(parameters) : parameters[0].get('timezone');

  // A series' first occurrences aren't capped, since later weeks can discard any of them. The
  // range limit bounds how many there are, and later weeks' Slot queries don't grow with them.
  const candidates = computeAlignedIntervals({
    context,
    effectiveRange,
    slots: existingSlots,
    maxCount: occurrenceCount > 1 ? Number.POSITIVE_INFINITY : pageSize,
  });
  if (candidates.length === 0) {
    return [];
  }

  const { alignmentInterval, alignmentOffset, alignmentTimezone, duration } = context.commonParameters;
  const alignment = { interval: alignmentInterval, offset: alignmentOffset, timezone: alignmentTimezone };

  // Candidates already sit inside every planning horizon and later weeks only move forward, so
  // only the earliest horizon end can clamp a later week or cut the series short. Resolved before
  // any Slot query, so a horizon too short for the series costs none.
  const horizonEnd = earliest(
    context.schedules
      .map((schedule) => schedule.planningHorizon?.end)
      .filter(isDefined)
      .map((end) => new Date(end))
  );
  const laterWeeks: Interval[] = [];
  for (let weeksForward = 1; weeksForward < occurrenceCount; weeksForward++) {
    const window = projectedWeekWindow(context, candidates, weekProjector(weeksForward, timezone));
    if (!window || (horizonEnd && window.start > horizonEnd)) {
      return [];
    }
    const end = horizonEnd && horizonEnd < window.end ? horizonEnd : window.end;
    laterWeeks.push({ start: window.start, end });
  }

  const laterWeekSlots = await Promise.all(
    laterWeeks.map(async (effectiveRange) => slotsOverlappingInterval(ctx.repo, params.schedules, effectiveRange))
  );

  // Use each candidate as the first entry of a weekly series. For each following week, we either
  // add an available recurrence, or we drop the series.
  let series = candidates.map((candidate) => [candidate]);

  for (const [idx, effectiveRange] of laterWeeks.entries()) {
    const { availability, hasBufferConflict } = computeAvailability({
      context,
      effectiveRange,
      slots: laterWeekSlots[idx],
    });

    const project = weekProjector(idx + 1, timezone);
    series = series
      .map((occurrences) => {
        // Always projected from the first occurrence, so a series stays anchored to one
        // wall-clock time instead of drifting across DST transitions. That time stays on a grid
        // kept in the same timezone, but can fall off one kept in another, where `$book` would
        // refuse it.
        const start = project(occurrences[0].start);
        if (!start || (alignmentTimezone !== timezone && !isAlignedToGrid(start, alignment))) {
          return undefined;
        }
        const occurrence = { start, end: addMinutes(start, duration) };
        const bookable =
          availability.some((interval) => interval.start <= start && occurrence.end <= interval.end) &&
          !hasBufferConflict(occurrence);
        return bookable ? [...occurrences, occurrence] : undefined;
      })
      .filter(isDefined);

    if (series.length === 0) {
      return [];
    }
  }

  // Still in chronological order, so these are the earliest offers.
  return series.slice(0, pageSize).map((occurrences) => buildAppointments(context, occurrences));
}

/**
 * Handles HTTP requests for the Appointment $find operation.
 *
 * Endpoints:
 *   [fhir base]/Appointment/$find
 *
 * @experimental - Scheduling Beta API
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentFindHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<AppointmentFindParameters>(appointmentFindOperation, req);

  const { schedule, start, end, _count } = params;

  const scheduleRefs = arrayify(schedule).map((reference) => ({ reference }));
  const invalidIndex = scheduleRefs.findIndex((ref) => !isReference(ref, 'Schedule'));
  if (invalidIndex !== -1) {
    throw new OperationOutcomeError(badRequest('Invalid schedule reference', `Parameters.schedule[${invalidIndex}]`));
  }

  const occurrenceCount = params['occurrence-count'] ?? 1;
  if (!Number.isInteger(occurrenceCount) || occurrenceCount < 1 || occurrenceCount > MAX_OCCURRENCE_COUNT) {
    throw new OperationOutcomeError(
      badRequest(
        `Invalid occurrence-count, must be an integer between 1 and ${MAX_OCCURRENCE_COUNT}`,
        'Parameters.occurrence-count'
      )
    );
  }

  let ignoreAppointment: WithPath<Reference<Appointment> & { reference: string }> | undefined;
  const ignoreAppointmentParam = params['ignore-appointment'];
  if (ignoreAppointmentParam) {
    if (occurrenceCount > 1) {
      throw new OperationOutcomeError(
        badRequest('ignore-appointment cannot be combined with occurrence-count', 'Parameters.ignore-appointment')
      );
    }
    const ref = { reference: ignoreAppointmentParam };
    if (!isReference<Appointment>(ref, 'Appointment')) {
      throw new OperationOutcomeError(
        badRequest('Invalid ignore-appointment reference', 'Parameters.ignore-appointment')
      );
    }
    ignoreAppointment = withPath(ref, 'Parameters.ignore-appointment');
  }

  const offers = await findAvailableSeries({
    start,
    end,
    healthcareService: { reference: params['service-type-reference'] },
    schedules: withPaths(scheduleRefs, 'Parameters.schedule'),
    ignoreAppointment,
    occurrenceCount,
    _count,
  });

  const bundle: Bundle<Appointment | Bundle<Appointment>> = {
    resourceType: 'Bundle',
    type: 'searchset',
    // One entry per offer, which `$book` takes whole.
    entry: offers.map((occurrences) => ({
      resource:
        occurrenceCount > 1
          ? { resourceType: 'Bundle', type: 'collection', entry: occurrences.map((resource) => ({ resource })) }
          : occurrences[0],
    })),
  };

  return [allOk, buildOutputParameters(appointmentFindOperation, bundle)];
}
