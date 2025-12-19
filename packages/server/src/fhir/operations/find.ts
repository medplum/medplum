// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  getExtensionValue,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, OperationDefinition, Resource, Schedule, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { flatMapMax } from '../../util/array';
import { applyExistingSlots, findSlotTimes, resolveAvailability } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import type { HardCoding, SchedulingParameters } from './utils/scheduling-parameters';
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
    { use: 'in', name: 'service-type', type: 'string', min: 0, max: '*' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type FindParameters = {
  start: string;
  end: string;
  'service-type'?: string;
};

const TimezoneExtensionURI = 'http://hl7.org/fhir/StructureDefinition/timezone';
function getTimeZone(resource: Resource): string | undefined {
  return getExtensionValue(resource, TimezoneExtensionURI) as string | undefined;
}

// Given scheduling parameter descriptions, and an array of input service types, return
// [SchedulingParameters, serviceType] pairs.
//
// - Each schedulingParameters description is returned at most once
// - If no specific matches are found, falls back to "wildcard" matches
function filterByServiceTypes(
  schedulingParameters: SchedulingParameters[],
  serviceTypes: string[]
): [SchedulingParameters, HardCoding | undefined][] {
  if (serviceTypes.length) {
    const results: [SchedulingParameters, HardCoding][] = [];
    for (const params of schedulingParameters) {
      const serviceType = params.serviceTypes.find((coding) =>
        serviceTypes.includes(`${coding.system}|${coding.code}`)
      );
      if (serviceType) {
        results.push([params, serviceType]);
      }
    }
    if (results.length) {
      return results;
    }
  }

  // We didn't find any parameters matching serviceType entries, use any wildcard results instead
  return schedulingParameters.filter((params) => params.wildcard).map((params) => [params, undefined]);
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

  // service types are in `${system}|${code}` format, in a comma separated list
  const serviceTypes = params['service-type']?.split(',') ?? [];

  // Future performance option: parameterize availability search with this
  // count so we can quit early once we have identified enough slots.
  const pageSize = DEFAULT_SEARCH_COUNT;

  const interval = { start: new Date(params.start), end: new Date(params.end) };

  if (interval.start >= interval.end) {
    throw new OperationOutcomeError(badRequest('Invalid search time range'));
  }

  const diffMilliseconds = interval.end.valueOf() - interval.start.valueOf();
  const diffDays = diffMilliseconds / (24 * 60 * 60 * 1000);
  if (diffDays > 31) {
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
  const timeZone = getTimeZone(actor);
  if (!timeZone) {
    throw new OperationOutcomeError(badRequest('No timezone specified'));
  }

  const allSchedulingParameters = parseSchedulingParametersExtensions(schedule);

  const resultSlots: Slot[] = flatMapMax(
    filterByServiceTypes(allSchedulingParameters, serviceTypes),
    ([schedulingParameters, serviceType], _idx, maxCount) => {
      const scheduleAvailability = resolveAvailability(schedulingParameters, interval, timeZone);
      const availability = applyExistingSlots(scheduleAvailability, slots, interval);
      return findSlotTimes(schedulingParameters, availability, { maxCount }).map(({ start, end }) => ({
        resourceType: 'Slot',
        start: start.toISOString(),
        end: end.toISOString(),
        schedule: createReference(schedule),
        status: 'free',
        ...(serviceType ? { serviceType: [{ coding: [serviceType] }] } : {}),
      }));
    },
    pageSize
  );

  const bundle: Bundle<Slot> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: resultSlots.slice(0, pageSize).map((slot) => ({ resource: slot })),
  };

  return [allOk, buildOutputParameters(findOperation, bundle)];
}
