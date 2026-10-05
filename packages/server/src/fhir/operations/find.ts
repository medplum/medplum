// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
  setPrimaryProvider,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, Bundle, HealthcareService, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { getAuthenticatedContext } from '../../context';
import { flatMapMax } from '../../util/array';
import type { Interval } from '../../util/date';
import { addMinutes, earliest, latest } from '../../util/date';
import type { WithPath } from '../../util/withpath';
import { copyPaths, getPath, withPath, withPaths } from '../../util/withpath';
import { makeOperationDefinition } from './definitions';
import { bufferTimeConflicts, findAlignedSlotTimes, overlappingIntervals } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  MAX_OCCURRENCE_COUNT,
  MIN_OCCURRENCE_COUNT,
  projectWeeksForward,
  weeklyRecurrenceTemplate,
} from './utils/recurrence';
import {
  applyExistingSlots,
  assertAllLoaded,
  buildAppointmentSlots,
  getSchedulingParametersGroup,
  intersectIntervals,
  intervalsExceedingCapacity,
  isAlignedToGrid,
  resolveAvailability,
  slotsOverlappingInterval,
} from './utils/scheduling';
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

const WEEK_MINUTES = 7 * 24 * 60;

// When scheduling across a week with a DST transition, the week may be this much longer
// or shorter than `WEEK_MINUTES` (Note that this undercounts some rare scenarios, such
// as in the "Antarctica/Troll" timezone which has a two hour gap).
const DST_FUDGE_HOURS = 1;

// The requested range. A series is searched for one local week at a time, which runs an hour
// longer across a DST transition.
function parseSearchRange(start: string, end: string, occurrenceCount: number | undefined): Interval {
  const range = { start: new Date(start), end: new Date(end) };
  if (range.start >= range.end) {
    throw new OperationOutcomeError(badRequest('Invalid search time range'));
  }
  const [maxDays, slackDays] = occurrenceCount ? [7, DST_FUDGE_HOURS / 24] : [31, 0];
  const diffDays = (range.end.valueOf() - range.start.valueOf()) / (24 * 60 * 60 * 1000);
  if (diffDays > maxDays + slackDays) {
    throw new OperationOutcomeError(badRequest(`Search range cannot exceed ${maxDays} days`));
  }
  return range;
}

// Internal implementation of $find logic
async function handler(params: {
  schedules: WithPath<Reference<Schedule> & { reference: string }>[];
  healthcareService: Reference<HealthcareService> & { reference: string };
  ignoreAppointment?: WithPath<Reference<Appointment> & { reference: string }>;
  searchRange: Interval;
  pageSize: number;
  occurrenceCount?: number;
}): Promise<Appointment[]> {
  const ctx = getAuthenticatedContext();
  const { searchRange, pageSize, occurrenceCount } = params;

  // A series is checked over the same range in each later week, widened by the hour a DST
  // transition can move a local time.
  const requestedRanges = [searchRange];
  for (let weeks = 1; weeks < (occurrenceCount ?? 1); weeks++) {
    requestedRanges.push({
      start: addMinutes(searchRange.start, weeks * WEEK_MINUTES - 60 * DST_FUDGE_HOURS),
      end: addMinutes(searchRange.end, weeks * WEEK_MINUTES + 60 * DST_FUDGE_HOURS),
    });
  }

  const ignoreAppointment = params.ignoreAppointment;
  const [schedules, allSlotsByRange, healthcareService, ignoredAppointment] = await Promise.all([
    ctx.repo.readReferences(params.schedules).then((schedules) => copyPaths(params.schedules, schedules)),
    Promise.all(
      requestedRanges.map((range, idx) =>
        slotsOverlappingInterval(
          ctx.repo,
          params.schedules,
          range,
          // The caller never sent a later week's bounds, so name them.
          idx === 0
            ? undefined
            : `Too many slots found for occurrence ${idx + 1}, between ${range.start.toISOString()} and ${range.end.toISOString()}; try searching with smaller bounds`
        )
      )
    ),
    ctx.repo.readReference<HealthcareService>(params.healthcareService).catch((err) => {
      if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
        throw new OperationOutcomeError(badRequest('HealthcareService not found'));
      }
      throw err;
    }),
    ignoreAppointment
      ? ctx.repo.readReference<Appointment>(ignoreAppointment).catch((err) => {
          if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
            throw new OperationOutcomeError(badRequest('Appointment not found', getPath(ignoreAppointment)));
          }
          throw err;
        })
      : undefined,
  ]);

  assertAllLoaded(schedules, 'Loading schedule failed');

  // The Slots held by the appointment being reassigned shouldn't block that appointment from
  // moving, so drop them before computing availability.
  const ignoredSlotIds = new Set((ignoredAppointment?.slot ?? []).map((ref) => resolveId(ref)).filter(isDefined));
  const slotsByRange = allSlotsByRange.map((slots) => slots.filter((slot) => !ignoredSlotIds.has(slot.id)));

  const parameterGroup = await getSchedulingParametersGroup(
    ctx.repo,
    schedules,
    withPath(healthcareService, 'Parameters.service-type-reference')
  );

  // Spans every week of a series, so planning horizons clamp later weeks too.
  const effectiveRange = { start: searchRange.start, end: requestedRanges[requestedRanges.length - 1].end };
  schedules.forEach((schedule) => {
    if (!serviceTypeIncludesService(schedule.serviceType, healthcareService)) {
      throw new OperationOutcomeError(
        badRequest('Schedule is not schedulable for requested service type', getPath(schedule))
      );
    }

    // If a schedule has a planning horizon, constrain search to values inside that horizon
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
  });

  // A series keeps its local time in the timezone its schedules' availability is defined in.
  const timezones = new Set([...parameterGroup.values()].map((parameters) => parameters.get('timezone')));
  if (occurrenceCount && timezones.size > 1) {
    throw new OperationOutcomeError(badRequest('All schedules must share one timezone to find a recurring series'));
  }
  const [timezone] = timezones;

  const commonParameters = extractCommonParameters([...parameterGroup.values()]);
  const serviceType = toServiceTypeCodeableConcepts(healthcareService);

  // Where an appointment can go within `range`, given the Slots fetched for it.
  const findAvailability = (
    range: Interval,
    slots: Slot[]
  ): { availability: Interval[]; hasBufferConflict: (interval: Interval) => boolean } => {
    const allAvailability = schedules.map((schedule) => {
      const schedulingParameters = parameterGroup.get(schedule);
      assert(schedulingParameters);

      const scheduleSlots = slots.filter((slot) => resolveId(slot.schedule) === schedule.id);
      let availability = resolveAvailability(schedulingParameters, range, schedulingParameters.get('timezone'));
      availability = applyExistingSlots({
        availability,
        slots: scheduleSlots,
        range,
        serviceType: healthcareService.type,
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
    const bufferChecks = schedules
      .map((schedule) => {
        const schedulingParameters = parameterGroup.get(schedule);
        assert(schedulingParameters);
        const bufferBefore = schedulingParameters.get('bufferBefore');
        const bufferAfter = schedulingParameters.get('bufferAfter');
        if (schedulingParameters.get('slotCapacity') === 1 || (bufferBefore === 0 && bufferAfter === 0)) {
          return undefined;
        }
        const scheduleSlots = slots.filter((slot) => resolveId(slot.schedule) === schedule.id);
        return { blocked: intervalsExceedingCapacity(scheduleSlots, 1), bufferBefore, bufferAfter };
      })
      .filter(isDefined);

    return {
      availability: intersectingAvailability,
      hasBufferConflict: (interval) =>
        bufferChecks.some((check) => bufferTimeConflicts(interval, check.blocked, check)),
    };
  };

  // Each week is resolved against only the Slots fetched for it, and a later occurrence is checked
  // against its own week alone. A week the planning horizons exclude has no availability.
  const [firstWeek, ...laterWeeks] = requestedRanges.map((range, idx) => {
    const clamped = intersectIntervals(range, effectiveRange);
    return clamped
      ? findAvailability(clamped, slotsByRange[idx])
      : { availability: [], hasBufferConflict: () => false };
  });

  const alignment = {
    interval: commonParameters.alignmentInterval,
    offset: commonParameters.alignmentOffset,
    timezone: commonParameters.alignmentTimezone,
  };

  // Each later occurrence of a series starts at the same local time, whole weeks later, and must be
  // bookable just as the first is.
  const isBookableEveryWeek = (candidate: Interval): boolean =>
    laterWeeks.every((week, idx) => {
      const start = projectWeeksForward(candidate.start, idx + 1, timezone);
      if (!start || !isAlignedToGrid(start, alignment)) {
        return false;
      }
      const occurrence = { start, end: addMinutes(start, commonParameters.duration) };
      return (
        week.availability.some((interval) => interval.start <= occurrence.start && occurrence.end <= interval.end) &&
        !week.hasBufferConflict(occurrence)
      );
    });

  const intervals = flatMapMax(
    firstWeek.availability,
    (interval, _idx, maxCount) =>
      findAlignedSlotTimes(interval, {
        alignment,
        durationMinutes: commonParameters.duration,
        maxCount,
        filter: (candidate) => !firstWeek.hasBufferConflict(candidate) && isBookableEveryWeek(candidate),
      }),
    pageSize
  );

  return intervals.map((interval) => {
    const start = interval.start.toISOString();
    const end = interval.end.toISOString();

    const slots = schedules.flatMap((schedule) => {
      const parameters = parameterGroup.get(schedule);
      assert(parameters);
      return buildAppointmentSlots({ schedule, parameters, interval });
    });

    const actors = schedules.flatMap((schedule) => schedule.actor);
    const participant = setPrimaryProvider(
      actors.map((actor) => ({ actor, required: 'required', status: 'needs-action' }) as const),
      // Schedules keep the request's order, so the first provider requested is the primary
      actors.find((actor) => actor.reference?.startsWith('Practitioner/'))
    );

    const appointment = {
      resourceType: 'Appointment',
      start,
      end,
      status: 'proposed',
      serviceType,
      participant,
      contained: slots,
      ...(occurrenceCount !== undefined && {
        extension: [weeklyRecurrenceTemplate(interval.start, occurrenceCount, timezone)],
      }),
    } satisfies Appointment;

    return appointment;
  });
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
  const occurrenceCount = params['occurrence-count'];

  const scheduleRefs = arrayify(params.schedule).map((reference) => ({ reference }));
  const invalidIndex = scheduleRefs.findIndex((ref) => !isReference(ref, 'Schedule'));
  if (invalidIndex !== -1) {
    throw new OperationOutcomeError(badRequest('Invalid schedule reference', `Parameters.schedule[${invalidIndex}]`));
  }

  let ignoreAppointment: WithPath<Reference<Appointment> & { reference: string }> | undefined;
  const ignoreAppointmentParam = params['ignore-appointment'];
  if (ignoreAppointmentParam) {
    const ref = { reference: ignoreAppointmentParam };
    if (!isReference<Appointment>(ref, 'Appointment')) {
      throw new OperationOutcomeError(
        badRequest('Invalid ignore-appointment reference', 'Parameters.ignore-appointment')
      );
    }
    ignoreAppointment = withPath(ref, 'Parameters.ignore-appointment');
  }

  const pageSize = params._count ?? DEFAULT_SEARCH_COUNT;
  if (pageSize < 1) {
    throw new OperationOutcomeError(badRequest('Invalid _count, minimum required is 1'));
  }
  if (pageSize > DEFAULT_MAX_SEARCH_COUNT) {
    throw new OperationOutcomeError(badRequest(`Invalid _count, maximum allowed is ${DEFAULT_MAX_SEARCH_COUNT}`));
  }

  if (
    occurrenceCount !== undefined &&
    (occurrenceCount < MIN_OCCURRENCE_COUNT || occurrenceCount > MAX_OCCURRENCE_COUNT)
  ) {
    throw new OperationOutcomeError(
      badRequest(
        `Invalid occurrence-count, must be between ${MIN_OCCURRENCE_COUNT} and ${MAX_OCCURRENCE_COUNT}`,
        'Parameters.occurrence-count'
      )
    );
  }

  if (occurrenceCount !== undefined && ignoreAppointment) {
    throw new OperationOutcomeError(
      badRequest('ignore-appointment cannot be combined with occurrence-count', 'Parameters.ignore-appointment')
    );
  }

  const searchRange = parseSearchRange(params.start, params.end, occurrenceCount);

  const appointments = await handler({
    searchRange,
    pageSize,
    healthcareService: { reference: params['service-type-reference'] },
    schedules: withPaths(scheduleRefs, 'Parameters.schedule'),
    ignoreAppointment,
    occurrenceCount,
  });

  const bundle: Bundle<Appointment> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: appointments.map((appointment) => ({
      resource: appointment,
    })),
  };

  return [allOk, buildOutputParameters(appointmentFindOperation, bundle)];
}
