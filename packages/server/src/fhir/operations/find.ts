// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  isNotFound,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, HealthcareService, OperationDefinition, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { isCodeableReferenceLikeTo, toCodeableReferenceLike } from '../../util/servicetype';
import { findSlotTimes } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { applyExistingSlots, getTimeZone, resolveAvailability, TimezoneExtensionURI } from './utils/scheduling';
import { chooseSchedulingParameters } from './utils/scheduling-parameters';

const findOperation = {
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

type FindParameters = {
  start: string;
  end: string;
  'service-type-reference': string;
  _count?: number;
};

// Internal implementation of $find logic
async function handler(params: {
  schedule: Reference<Schedule> & { reference: string };
  healthcareService: Reference<HealthcareService> & { reference: string };
  start: string;
  end: string;
  _count?: number;
}): Promise<Slot[]> {
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

  const [schedule, existingSlots, healthcareService] = await Promise.all([
    ctx.repo.readReference(params.schedule),
    ctx.repo.searchResources<Slot>({
      resourceType: 'Slot',

      count: DEFAULT_MAX_SEARCH_COUNT,

      filters: [
        {
          code: 'schedule',
          operator: Operator.EQUALS,
          value: params.schedule.reference,
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

  if (!isCodeableReferenceLikeTo(schedule.serviceType, healthcareService)) {
    throw new OperationOutcomeError(badRequest('Schedule is not scheduleable for requested service type'));
  }

  // If we filled a full search page of slots, then there may be slots we
  // didn't fetch that would impact availability. Fail loudly here.
  if (existingSlots.length === DEFAULT_MAX_SEARCH_COUNT) {
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

  const schedulingParameters = chooseSchedulingParameters(schedule, healthcareService);
  if (!schedulingParameters) {
    throw new OperationOutcomeError(badRequest('SchedulingParameters not present on Schedule or HealthcareService'));
  }

  const activeTimeZone = schedulingParameters.timezone ?? actorTimeZone;

  let availability = resolveAvailability(schedulingParameters, range, activeTimeZone);
  availability = applyExistingSlots({
    availability,
    slots: existingSlots,
    range,
    serviceType: healthcareService.type,
  });

  const serviceType = toCodeableReferenceLike(healthcareService);

  return findSlotTimes(schedulingParameters, availability, { maxCount: pageSize }).map(
    ({ start, end }) =>
      ({
        resourceType: 'Slot',
        start: start.toISOString(),
        end: end.toISOString(),
        schedule: createReference(schedule),
        status: 'free',
        serviceType,
      }) satisfies Slot
  );
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
  const params = parseInputParameters<FindParameters>(findOperation, req);
  const resultSlots = await handler({
    start: params.start,
    end: params.end,
    _count: params._count,
    schedule: { reference: `Schedule/${req.params.id}` },
    healthcareService: { reference: params['service-type-reference'] },
  });
  const bundle: Bundle<Slot> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: resultSlots.map((slot) => ({ resource: slot })),
  };

  return [allOk, buildOutputParameters(findOperation, bundle)];
}
