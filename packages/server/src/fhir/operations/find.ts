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
import type {
  ActivityDefinition,
  Bundle,
  CodeableConcept,
  OperationDefinition,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
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

function matchesServiceType(serviceTypes: string[], codeableConcepts: CodeableConcept[]): CodeableConcept | undefined {
  return codeableConcepts.find((concept) =>
    serviceTypes.some((serviceType) =>
      concept.coding?.some((coding) => serviceType === `${coding.system}|${coding.code}`)
    )
  );
}

// Given scheduling parameter descriptions, and an array of input service types, return
// [SchedulingParameters, serviceType] pairs.
//
// - Each schedulingParameters description is returned at most once
// - If no specific matches are found, falls back to "wildcard" matches
//   (scheduling parameters having no associated codes match any input codes)
//
// Design decision: if we find any matches at a given priority level, we do not
// return matches with less priority. There's an argument that when processing
// multiple service-type inputs, we should process each independently, finding
// the best match. For this initial implementation, we've decided that it is
// better to avoid returning results that mix sources, to make the outcomes
// easier to understand.
function chooseSchedulingParameters(
  schedule: Schedule,
  activityDefinitions: ActivityDefinition[],
  serviceTypes: string[]
): (readonly [SchedulingParameters, CodeableConcept | undefined])[] {
  const scheduleSchedulingParameters = parseSchedulingParametersExtensions(schedule);

  // Top priority: entries on an individual schedule matching a service type
  const specificMatches = scheduleSchedulingParameters.flatMap((schedulingParameters) => {
    const serviceType = matchesServiceType(serviceTypes, schedulingParameters.serviceType);
    return serviceType ? [[schedulingParameters, serviceType] as const] : [];
  });

  if (specificMatches.length) {
    return specificMatches;
  }

  // Next: entries on ActivityDefinition matching a service type
  const activitySchedulingParameters = activityDefinitions.flatMap((activityDefinition) =>
    parseSchedulingParametersExtensions(activityDefinition)
  );
  const sharedMatches = activitySchedulingParameters.flatMap((schedulingParameters) => {
    const serviceType = matchesServiceType(serviceTypes, schedulingParameters.serviceType);
    return serviceType ? [[schedulingParameters, serviceType] as const] : [];
  });

  if (sharedMatches.length) {
    return sharedMatches;
  }

  // Fall back on "wildcard" type parameters on the schedule (entries that do
  // not have any `serviceType` sub extension)
  return scheduleSchedulingParameters
    .filter((params) => params.serviceType.length === 0)
    .map((params) => [params, undefined]);
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

  const activityDefinitionSearch: Promise<ActivityDefinition[]> =
    serviceTypes.length === 0
      ? Promise.resolve([])
      : ctx.repo.searchResources<ActivityDefinition>({
          resourceType: 'ActivityDefinition',
          filters: [
            {
              code: 'code',
              operator: Operator.EQUALS,
              value: serviceTypes.join(','),
            },
          ],
        });

  const [schedule, slots, activityDefinitions] = await Promise.all([
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
    activityDefinitionSearch,
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

  const resultSlots: Slot[] = flatMapMax(
    chooseSchedulingParameters(schedule, activityDefinitions, serviceTypes),
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
