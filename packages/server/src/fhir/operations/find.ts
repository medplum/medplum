// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  EMPTY,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, CodeableConcept, OperationDefinition, Schedule, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { flatMapMax } from '../../util/array';
import { findSlotTimes } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { applyExistingSlots, getTimeZone, resolveAvailability, TimezoneExtensionURI } from './utils/scheduling';
import type { SchedulingParameters } from './utils/scheduling-parameters';
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
    { use: 'in', name: '_count', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type FindParameters = {
  start: string;
  end: string;
  'service-type'?: string;
  _count?: number;
};

// Given scheduling parameter descriptions, and an array of input service types, return
// [SchedulingParameters, serviceType] pairs.
//
// - Each schedulingParameters description is returned at most once
// - If no specific matches are found, falls back to "wildcard" matches
//   (scheduling parameters having no associated codes match any input codes)
function filterByServiceTypes(
  schedulingParameters: SchedulingParameters[],
  serviceTypes: string[]
): [SchedulingParameters, CodeableConcept | undefined][] {
  if (serviceTypes.length) {
    const results: [SchedulingParameters, CodeableConcept][] = [];
    for (const params of schedulingParameters) {
      const serviceType = params.serviceType.find((codeableConcept) =>
        codeableConcept.coding?.some((coding) => serviceTypes.includes(`${coding.system}|${coding.code}`))
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
  return schedulingParameters.filter((params) => params.serviceType.length === 0).map((params) => [params, undefined]);
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
  const { start, end, _count } = params;

  // service types are in `${system}|${code}` format, in a comma separated list
  const serviceTypes = params['service-type']?.split(',') ?? [];

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
  ]);

  // If we filled a full search page of slots, then there may be slots we
  // didn't fetch that would impact availability. Fail loudly here.
  if (slots.length === DEFAULT_MAX_SEARCH_COUNT) {
    throw new OperationOutcomeError(badRequest('Too many slots found in range; try searching with smaller bounds'));
  }

  if (schedule.actor.length !== 1) {
    throw new OperationOutcomeError(badRequest('$find only supported on schedules with exactly one actor'));
  }
  const actor = await ctx.repo.readReference(schedule.actor[0]);
  const actorTimeZone = getTimeZone(actor);
  if (!actorTimeZone) {
    throw new OperationOutcomeError(
      badRequest('No timezone specified', `Schedule.actor[0].extension(${TimezoneExtensionURI})`)
    );
  }

  const allSchedulingParameters = parseSchedulingParametersExtensions(schedule);

  const resultSlots: Slot[] = flatMapMax(
    filterByServiceTypes(allSchedulingParameters, serviceTypes),
    ([schedulingParameters, serviceType], _idx, maxCount) => {
      // If the scheduling parameters explicitly declare a timezone, use it instead of the actor's TZ
      const activeTimeZone = schedulingParameters.timezone ?? actorTimeZone;
      let availability = resolveAvailability(schedulingParameters, range, activeTimeZone);
      availability = applyExistingSlots({
        availability,
        slots,
        range,
        serviceType: serviceType ? [serviceType] : EMPTY,
      });
      return findSlotTimes(schedulingParameters, availability, { maxCount }).map(({ start, end }) => ({
        resourceType: 'Slot',
        start: start.toISOString(),
        end: end.toISOString(),
        schedule: createReference(schedule),
        status: 'free',
        ...(serviceType ? { serviceType: [serviceType] } : {}),
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
