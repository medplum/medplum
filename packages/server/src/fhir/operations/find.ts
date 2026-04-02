// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  isDefined,
  isNotFound,
  isResource,
  OperationOutcomeError,
  Operator,
  resolveId,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, HealthcareService, OperationDefinition, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { flatMapMax } from '../../util/array';
import { addMinutes } from '../../util/date';
import { invariant } from '../../util/invariant';
import { isCodeableReferenceLikeTo, toCodeableReferenceLike } from '../../util/servicetype';
import { findAlignedSlotTimes, overlappingIntervals } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { applyExistingSlots, getTimeZone, resolveAvailability, TimezoneExtensionURI } from './utils/scheduling';
import { chooseSchedulingParameterGroup, extractCommonParameters } from './utils/scheduling-parameters';

const scheduleFindOperation = {
  resourceType: 'OperationDefinition',
  name: 'find',
  status: 'active',
  kind: 'operation',
  code: 'find',
  resource: ['Schedule'],
  system: false,
  type: false,
  instance: true,
  parameter: [
    { use: 'in', name: 'start', type: 'dateTime', min: 1, max: '1' },
    { use: 'in', name: 'end', type: 'dateTime', min: 1, max: '1' },
    { use: 'in', name: 'service-type-reference', type: 'string', min: 1, max: '1', searchType: 'reference' },
    { use: 'in', name: '_count', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type ScheduleFindParameters = {
  start: string;
  end: string;
  'service-type-reference': string;
  _count?: number;
};

// Internal implementation of $find logic
async function handler(params: {
  schedules: (Reference<Schedule> & { reference: string })[];
  healthcareService: Reference<HealthcareService> & { reference: string };
  start: string;
  end: string;
  _count?: number;
}): Promise<Slot[][]> {
  const ctx = getAuthenticatedContext();
  const { start, end, _count } = params;

  const pageSize = _count ?? DEFAULT_SEARCH_COUNT;
  if (pageSize < 1) {
    throw new OperationOutcomeError(badRequest('Invalid _count, minimum required is 1'));
  }
  if (pageSize > DEFAULT_MAX_SEARCH_COUNT) {
    throw new OperationOutcomeError(badRequest(`Invalid _count, maximum allowed is ${DEFAULT_MAX_SEARCH_COUNT}`));
  }

  const range = { start: new Date(params.start), end: new Date(params.end) };

  if (range.start >= range.end) {
    throw new OperationOutcomeError(badRequest('Invalid search time range'));
  }

  const diffMilliseconds = range.end.valueOf() - range.start.valueOf();
  const diffDays = diffMilliseconds / (24 * 60 * 60 * 1000);
  if (diffDays > 31) {
    throw new OperationOutcomeError(badRequest('Search range cannot exceed 31 days'));
  }

  const [schedules, existingSlots, healthcareService] = await Promise.all([
    ctx.repo.readReferences(params.schedules),
    ctx.repo.searchResources<Slot>({
      resourceType: 'Slot',

      count: DEFAULT_MAX_SEARCH_COUNT,

      filters: [
        {
          code: 'schedule',
          operator: Operator.EQUALS,
          value: params.schedules.map((ref) => ref.reference).join(','),
        },

        {
          code: '_filter',
          operator: Operator.EQUALS,
          // Slot starts sometime in range, OR
          // Slot ends sometime in range, OR
          // Slot time fully contains range
          value: `((start ge "${start}" and start le "${end}") or (end ge "${start}" and end le "${end}") or (start lt "${start}" and end gt "${end}"))`,
        },

        {
          code: 'status',
          operator: Operator.EQUALS,
          value: 'busy,busy-tentative,busy-unavailable,free',
        },
      ],
    }),
    ctx.repo.readReference<HealthcareService>(params.healthcareService).catch((err) => {
      if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
        throw new OperationOutcomeError(badRequest('HealthcareService not found'));
      }
      throw err;
    }),
  ]);

  if (!schedules.every((schedule) => isResource(schedule))) {
    const idx = schedules.findIndex((schedule) => !isResource(schedule));
    throw new OperationOutcomeError(badRequest('Loading schedule failed', `schedule[${idx}]`));
  }

  const parameterGroup = chooseSchedulingParameterGroup(schedules, healthcareService);

  schedules.forEach((schedule, idx) => {
    if (!isCodeableReferenceLikeTo(schedule.serviceType, healthcareService)) {
      throw new OperationOutcomeError(
        badRequest('Schedule is not scheduleable for requested service type', `Parameters.schedule[${idx}]`)
      );
    }

    if (schedule.actor.length !== 1) {
      throw new OperationOutcomeError(
        badRequest('$find only supported on schedules with exactly one actor', `Parameters.schedule[${idx}]`)
      );
    }

    if (!parameterGroup.get(schedule)) {
      throw new OperationOutcomeError(
        badRequest('No SchedulingParameters found on Schedule or HealthcareService', `Parameters.schedule[${idx}]`)
      );
    }
  });

  const commonParameters = extractCommonParameters([...parameterGroup.values()].filter(isDefined));

  // If we filled a full search page of slots, then there may be slots we
  // didn't fetch that would impact availability. Fail loudly here.
  if (existingSlots.length === DEFAULT_MAX_SEARCH_COUNT) {
    throw new OperationOutcomeError(badRequest('Too many slots found in range; try searching with smaller bounds'));
  }

  const actors = await ctx.repo.readReferences(schedules.map((schedule) => schedule.actor[0]));
  if (!actors.every((actor) => isResource(actor))) {
    const idx = actors.findIndex((actor) => !isResource(actor));
    throw new OperationOutcomeError(badRequest('Loading schedule.actor failed', `Parameters.schedule[${idx}]`));
  }

  const serviceType = toCodeableReferenceLike(healthcareService);

  const allAvailability = schedules.map((schedule, idx) => {
    const schedulingParameters = parameterGroup.get(schedule);
    invariant(schedulingParameters);
    const actor = actors[idx];
    const actorTimeZone = getTimeZone(actor);
    const activeTimeZone = schedulingParameters.timezone ?? actorTimeZone;
    if (!activeTimeZone) {
      throw new OperationOutcomeError(
        badRequest('No timezone specified', `Parameters.schedule[${idx}].actor[0].extension(${TimezoneExtensionURI})`)
      );
    }

    const scheduleSlots = existingSlots.filter((slot) => resolveId(slot.schedule) === schedule.id);
    let availability = resolveAvailability(schedulingParameters, range, activeTimeZone);
    availability = applyExistingSlots({
      availability,
      slots: scheduleSlots,
      range,
      serviceType: healthcareService.type,
    });

    // Trim off bufferBefore/bufferAfter from availability
    availability = availability.map((interval) => ({
      start: addMinutes(interval.start, schedulingParameters.bufferBefore),
      end: addMinutes(interval.end, -1 * schedulingParameters.bufferAfter),
    }));

    return availability;
  });

  const intersectingAvailability = allAvailability.reduce((acc, val) => overlappingIntervals(acc, val));
  const intervals = flatMapMax(
    intersectingAvailability,
    (interval, _idx, maxCount) =>
      findAlignedSlotTimes(interval, {
        offsetMinutes: commonParameters.alignmentOffset,
        durationMinutes: commonParameters.duration,
        alignment: commonParameters.alignmentInterval,
        maxCount,
      }),
    pageSize
  );

  return intervals.map((interval) => {
    return schedules.flatMap((schedule) => {
      const parameters = parameterGroup.get(schedule);
      invariant(parameters);

      const start = interval.start.toISOString();
      const end = interval.end.toISOString();

      const slots: Slot[] = [
        {
          resourceType: 'Slot',
          start,
          end,
          schedule: createReference(schedule),
          status: 'busy',
          serviceType,
        },
      ];

      if (parameters.bufferBefore) {
        slots.push({
          resourceType: 'Slot',
          start: addMinutes(interval.start, -1 * parameters.bufferBefore).toISOString(),
          end: start,
          schedule: createReference(schedule),
          status: 'busy-unavailable',
          serviceType,
          comment: 'buffer before appointment',
        });
      }

      if (parameters.bufferAfter) {
        slots.push({
          resourceType: 'Slot',
          start: end,
          end: addMinutes(interval.end, parameters.bufferAfter).toISOString(),
          schedule: createReference(schedule),
          status: 'busy-unavailable',
          serviceType,
          comment: 'buffer after appointment',
        });
      }

      return slots;
    });
  });
}

/**
 * Handles HTTP requests for the Schedule $find operation.
 *
 * Endpoints:
 *   [fhir base]/Schedule/[id]/$find
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function scheduleFindHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ScheduleFindParameters>(scheduleFindOperation, req);
  const proposedSlots = await handler({
    start: params.start,
    end: params.end,
    _count: params._count,
    schedules: [{ reference: `Schedule/${req.params.id}` }],
    healthcareService: { reference: params['service-type-reference'] },
  });

  const entry = proposedSlots.map((slots) => {
    // We passed in a single schedule, so each resulting slot should have
    // a single "busy" slot.
    const slot = slots.find((s) => s.status === 'busy');
    invariant(slot);
    // In the single schedule $find, we show the potential slots as "free", as they represent
    // bookable time rather than a proposed set of resources to create during booking.
    return { resource: { ...slot, status: 'free' as const } };
  });

  const bundle: Bundle<Slot> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry,
  };

  return [allOk, buildOutputParameters(scheduleFindOperation, bundle)];
}
