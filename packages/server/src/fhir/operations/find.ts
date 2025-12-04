// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { tz } from '@date-fns/tz';
import {
  allOk,
  badRequest,
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, OperationDefinition, Schedule, Slot } from '@medplum/fhirtypes';
import { addMinutes, differenceInDays, subMinutes } from 'date-fns';
import { getAuthenticatedContext } from '../../context';
import { applyExistingSlots, findAlignedSlots, resolveAvailability } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { parseSchedulingParametersExtensions } from './utils/scheduling-parameters';

const findOperation = {
  resourceType: 'OperationDefinition',
  name: 'find',
  status: 'active',
  kind: 'operation',
  code: 'find',
  resource: ['Schedule'],
  system: false,
  type: true,
  instance: true,
  parameter: [
    { use: 'in', name: 'start', type: 'dateTime', min: 1, max: '1' },
    { use: 'in', name: 'end', type: 'dateTime', min: 1, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type FindParameters = {
  start: string;
  end: string;
};

const TimezoneExtensionURI = 'http://hl7.org/fhir/StructureDefinition/timezone';
function getTimezone(schedule: Schedule): string | undefined {
  return (schedule.extension ?? []).find((extension) => extension.url === TimezoneExtensionURI)?.valueCode;
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
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<FindParameters>(findOperation, req);
  const { start, end } = params;

  // Future performance option: parameterize availability search with this
  // count so we can quit early once we have identified enough slots.
  const pageSize = DEFAULT_SEARCH_COUNT;

  const interval = { start: new Date(params.start), end: new Date(params.end) };

  if (interval.start >= interval.end) {
    throw new OperationOutcomeError(badRequest('Invalid search time range'));
  }

  if (differenceInDays(interval.end, interval.start) > 31) {
    throw new OperationOutcomeError(badRequest('Search range cannot exceed 31 days'));
  }

  const [schedule, slots] = await Promise.all([
    ctx.repo.readResource<Schedule>('Schedule', req.params.id),
    ctx.repo.searchResources<Slot>({
      resourceType: 'Slot',

      count: DEFAULT_MAX_SEARCH_COUNT,

      filters: [
        {
          code: 'schedule',
          operator: Operator.EQUALS,
          value: `Schedule/${req.params.id}`,
        },

        {
          code: '_filter',
          operator: Operator.EQUALS,
          // Slot starts sometime in interval, OR
          // Slot ends sometime in interval, OR
          // Slot time fully contains interval
          value: `((start ge "${start}" and start le "${end}") or (end ge "${start}" and end le "${end}") or (start lt "${start}" and end gt "${end}"))`,
        },

        {
          code: 'status',
          operator: Operator.EQUALS,
          value: 'busy,free,busy-unavailable',
        },
      ],
    }),
  ]);

  // If we filled a full search page of slots, then there may be slots we
  // didn't fetch that would impact availability. Fail loudly here.
  if (slots.length === DEFAULT_MAX_SEARCH_COUNT) {
    throw new OperationOutcomeError(badRequest('Too many slots found in range; try searching with smaller bounds'));
  }

  if (schedule.actor.length !== 1) {
    throw new OperationOutcomeError(badRequest('$find only supported on schedules with exactly one actor'));
  }

  const [actor] = await ctx.repo.readReferences(schedule.actor);
  if (actor instanceof Error) {
    throw new OperationOutcomeError(badRequest('Loading actor for schedule failed'), { cause: actor });
  }
  const timezone = getTimezone(actor);
  const opts = timezone ? { in: tz(timezone) } : {};
  const allSchedulingParameters = parseSchedulingParametersExtensions(schedule);

  // TODO:
  // - handle accepting serviceType parameters and using more specific scheduling options
  // - handle getting availability from an ActivityDefinition matching the codes
  //
  // For initial implementation purposes, use the default ("wildcard") scheduling parameters
  const schedulingParameters = allSchedulingParameters.find((p) => p.wildcard);

  if (!schedulingParameters) {
    throw new OperationOutcomeError(badRequest('No matching scheduling parameters found'));
  }

  const scheduleAvailability = resolveAvailability(schedulingParameters, interval, opts);
  const availability = applyExistingSlots(scheduleAvailability, slots, interval, opts);

  const alignmentOptions = {
    // Search for slots that are large enough to include the duration with any
    // buffer before/after included.
    durationMinutes:
      schedulingParameters.duration + schedulingParameters.bufferBefore + schedulingParameters.bufferAfter,
    alignment: schedulingParameters.alignmentInterval,
    // Shift our search alignment by any `bufferBefore`; Example: if we are
    // trying to find a slot at :30 with a 10 minute bufferBefore free, we need
    // to find slots starting at :20 (with the buffer included in the duration)
    offsetMinutes: schedulingParameters.alignmentOffset - schedulingParameters.bufferBefore,
  };

  const slotIntervals = availability
    .flatMap((interval) => findAlignedSlots(interval, alignmentOptions))
    .slice(0, pageSize)
    .map((interval) => ({
      // interval is inclusive of before/after buffer times; remove them from the
      // slots we will return to caller
      start: addMinutes(interval.start, schedulingParameters.bufferBefore),
      end: subMinutes(interval.end, schedulingParameters.bufferAfter),
    }));

  const bundle: Bundle<Slot> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: slotIntervals.map((interval) => ({
      resource: {
        resourceType: 'Slot',
        start: interval.start.toISOString(),
        end: interval.end.toISOString(),
        schedule: createReference(schedule),
        status: 'free',
      },
    })),
  };

  return [allOk, buildOutputParameters(findOperation, bundle)];
}
