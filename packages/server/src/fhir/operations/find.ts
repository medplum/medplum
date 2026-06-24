// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  arrayify,
  badRequest,
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  isNotFound,
  isReference,
  OperationOutcomeError,
  resolveId,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, Bundle, HealthcareService, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { getAuthenticatedContext } from '../../context';
import { flatMapMax } from '../../util/array';
import { addMinutes, earliest, latest } from '../../util/date';
import { isCodeableReferenceLikeTo, toCodeableReferenceLike } from '../../util/servicetype';
import type { WithPath } from '../../util/withpath';
import { copyPaths, getPath, withPath, withPaths } from '../../util/withpath';
import { makeOperationDefinition } from './definitions';
import { findAlignedSlotTimes, overlappingIntervals } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  applyExistingSlots,
  assertAllLoaded,
  getSchedulingParametersGroup,
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
  _count?: number;
};

// Internal implementation of $find logic
async function handler(params: {
  schedules: WithPath<Reference<Schedule> & { reference: string }>[];
  healthcareService: Reference<HealthcareService> & { reference: string };
  start: string;
  end: string;
  _count?: number;
}): Promise<Appointment[]> {
  const ctx = getAuthenticatedContext();

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

  const diffMilliseconds = requestedRange.end.valueOf() - requestedRange.start.valueOf();
  const diffDays = diffMilliseconds / (24 * 60 * 60 * 1000);
  if (diffDays > 31) {
    throw new OperationOutcomeError(badRequest('Search range cannot exceed 31 days'));
  }

  const [schedules, existingSlots, healthcareService] = await Promise.all([
    ctx.repo.readReferences(params.schedules).then((schedules) => copyPaths(params.schedules, schedules)),
    slotsOverlappingInterval(ctx.repo, params.schedules, requestedRange),
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

  const effectiveRange = { start: requestedRange.start, end: requestedRange.end };
  schedules.forEach((schedule) => {
    if (!isCodeableReferenceLikeTo(schedule.serviceType, healthcareService)) {
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

  const commonParameters = extractCommonParameters([...parameterGroup.values()]);
  const serviceType = toCodeableReferenceLike(healthcareService);

  const allAvailability = schedules.map((schedule) => {
    const schedulingParameters = parameterGroup.get(schedule);
    assert(schedulingParameters);

    const scheduleSlots = existingSlots.filter((slot) => resolveId(slot.schedule) === schedule.id);
    let availability = resolveAvailability(schedulingParameters, effectiveRange, schedulingParameters.get('timezone'));
    availability = applyExistingSlots({
      availability,
      slots: scheduleSlots,
      range: effectiveRange,
      serviceType: healthcareService.type,
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

  const intervals = flatMapMax(
    intersectingAvailability,
    (interval, _idx, maxCount) =>
      findAlignedSlotTimes(interval, {
        alignment: {
          interval: commonParameters.alignmentInterval,
          offset: commonParameters.alignmentOffset,
          timezone: commonParameters.alignmentTimezone,
        },
        durationMinutes: commonParameters.duration,
        maxCount,
      }),
    pageSize
  );

  return intervals.map((interval) => {
    const start = interval.start.toISOString();
    const end = interval.end.toISOString();

    const slots = schedules.flatMap((schedule) => {
      const parameters = parameterGroup.get(schedule);
      assert(parameters);

      const resultSlots: Slot[] = [
        {
          resourceType: 'Slot',
          start,
          end,
          schedule: createReference(schedule),
          status: 'busy',
          serviceType,
        },
      ];

      if (parameters.get('bufferBefore')) {
        resultSlots.push({
          resourceType: 'Slot',
          start: addMinutes(interval.start, -1 * parameters.get('bufferBefore')).toISOString(),
          end: start,
          schedule: createReference(schedule),
          status: 'busy-unavailable',
          serviceType,
          comment: 'buffer before appointment',
        });
      }

      if (parameters.get('bufferAfter')) {
        resultSlots.push({
          resourceType: 'Slot',
          start: end,
          end: addMinutes(interval.end, parameters.get('bufferAfter')).toISOString(),
          schedule: createReference(schedule),
          status: 'busy-unavailable',
          serviceType,
          comment: 'buffer after appointment',
        });
      }
      return resultSlots;
    });

    const participant = schedules.flatMap((schedule) =>
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
      serviceType,
      participant,
      contained: slots,
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
 * @experimental - Scheduling Alpha API
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

  const appointments = await handler({
    start,
    end,
    _count,
    healthcareService: { reference: params['service-type-reference'] },
    schedules: withPaths(scheduleRefs, 'Parameters.schedule'),
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
