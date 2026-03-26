// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  codeableConceptMatchesToken,
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  isDefined,
  isResource,
  OperationOutcomeError,
  Operator,
  resolveId,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Appointment,
  Bundle,
  CodeableConcept,
  OperationDefinition,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { flatMapMax } from '../../util/array';
import type { Interval } from '../../util/date';
import { addMinutes } from '../../util/date';
import { invariant } from '../../util/invariant';
import { findAlignedSlotTimes } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { applyExistingSlots, getTimeZone, overlappingIntervals, resolveAvailability } from './utils/scheduling';
import type { SchedulingParameters } from './utils/scheduling-parameters';
import { parseSchedulingParametersExtensions } from './utils/scheduling-parameters';

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
    { use: 'in', name: 'service-type', type: 'string', min: 1, max: '*' },
    { use: 'in', name: '_count', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

const appointmentFindOperation = {
  resourceType: 'OperationDefinition',
  name: 'find',
  status: 'active',
  kind: 'operation',
  code: 'find',
  resource: ['Appointment'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    { use: 'in', name: 'start', type: 'dateTime', min: 1, max: '1' },
    { use: 'in', name: 'end', type: 'dateTime', min: 1, max: '1' },
    { use: 'in', name: 'service-type', type: 'string', min: 1, max: '*' },
    { use: 'in', name: 'schedule', type: 'string', min: 1, max: '*', searchType: 'reference' },
    { use: 'in', name: '_count', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type ScheduleFindParameters = {
  start: string;
  end: string;
  'service-type': string;
  _count?: number;
};

type FindParameters = {
  start: string;
  end: string;
  'service-type': string;
  schedule: string | string[];
  _count?: number;
};

type CommonSchedulingParameters = {
  duration: number;
  alignmentInterval: number;
  alignmentOffset: number;
  serviceType: CodeableConcept;
};

function allMatch(values: unknown[]): boolean {
  const first = values[0];
  return values.every((value) => value === first);
}

type SchedulingParameterGroup = [CommonSchedulingParameters, Map<Schedule, SchedulingParameters>];

function chooseSchedulingParameters(serviceTypeTokens: string[], schedules: Schedule[]): SchedulingParameterGroup[] {
  const allSchedulingParameters = schedules.map((schedule) => parseSchedulingParametersExtensions(schedule));

  const results: SchedulingParameterGroup[] = [];

  for (const token of serviceTypeTokens) {
    const params = allSchedulingParameters.map((parametersOptions) => {
      // question: should this use `filter` instead of `find`? That is, can you have multiple parameters with the same service-type token?
      // probably yes, makes matching much harder though... punt for now?
      return parametersOptions.find((parameters) =>
        parameters.serviceType.some((concept) => codeableConceptMatchesToken(concept, token))
      );
    });

    if (!params.every(isDefined)) {
      continue;
    }
    if (!allMatch(params.map((p) => p.duration))) {
      continue;
    }
    if (!allMatch(params.map((p) => p.alignmentInterval))) {
      continue;
    }
    if (!allMatch(params.map((p) => p.alignmentOffset))) {
      continue;
    }

    // Find first matching service type to use as exemplar; Open question: should we do something special
    // if the service types aren't all identical? For example, should we choose the service type that is the
    // most/least expansive by number of codes?
    const serviceType = params[0].serviceType.find((concept) => codeableConceptMatchesToken(concept, token));
    invariant(serviceType);

    results.push([
      {
        duration: params[0].duration,
        alignmentInterval: params[0].alignmentInterval,
        alignmentOffset: params[0].alignmentOffset,
        serviceType,
      },
      new Map(schedules.map((schedule, idx) => [schedule, params[idx]])),
    ]);
  }

  return results;
}

async function handler(params: {
  start: string;
  end: string;
  'service-type': string[];
  schedule: Reference<Schedule>[];
  _count?: number;
}): Promise<[{ interval: Interval; serviceType: CodeableConcept }[], Schedule[]]> {
  const ctx = getAuthenticatedContext();
  const { start, end, _count } = params;

  // service types are in `${system}|${code}` format
  const serviceTypeTokens = params['service-type'];

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

  const [schedules, slots] = await Promise.all([
    ctx.repo.readReferences<Schedule>(params.schedule),
    ctx.repo.searchResources<Slot>({
      resourceType: 'Slot',

      count: DEFAULT_MAX_SEARCH_COUNT,

      filters: [
        {
          code: 'schedule',
          operator: Operator.EQUALS,
          value: params.schedule.map((schedule) => schedule.reference).join(','),
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

  if (!schedules.every((schedule) => isResource(schedule))) {
    const idx = schedules.findIndex((schedule) => !isResource(schedule));
    throw new OperationOutcomeError(badRequest('Loading schedule failed', `schedule[${idx}]`));
  }

  if (schedules.some((schedule) => schedule.actor.length !== 1)) {
    throw new OperationOutcomeError(badRequest('$find only supported on schedules with exactly one actor'));
  }

  const actors = await ctx.repo.readReferences(schedules.map((schedule) => schedule.actor[0]));
  if (!actors.every((actor) => isResource(actor))) {
    const idx = actors.findIndex((actor) => !isResource(actor));
    throw new OperationOutcomeError(badRequest('Loading schedule.actor failed', `schedule[${idx}]`));
  }

  const schedulingParameterGroups = chooseSchedulingParameters(serviceTypeTokens, schedules);
  if (schedulingParameterGroups.length === 0) {
    // TODO: Can we improve this error message?
    throw new OperationOutcomeError(badRequest('No scheduling parameters found for the requested service type(s)'));
  }

  const results: { interval: Interval; serviceType: CodeableConcept }[] = flatMapMax(
    schedulingParameterGroups,
    (schedulingParameterGroup, _idx, maxCount) => {
      const allAvailability = schedules.map((schedule, idx) => {
        const actor = actors[idx];
        const actorTimeZone = getTimeZone(actor);
        const schedulingParameters = schedulingParameterGroup[1].get(schedule);
        invariant(schedulingParameters);

        const activeTimeZone = schedulingParameters.timezone ?? actorTimeZone;
        if (!activeTimeZone) {
          // TODO: Throw error?
          throw new Error('Timezone not established');
        }

        const scheduleSlots = slots.filter((slot) => resolveId(slot.schedule) === schedule.id);

        // Get base availability from scheduling recurrence
        const availability = resolveAvailability(schedulingParameters, range, activeTimeZone);

        // Merge in Slot resources ("free" to add availability, others that reduce it)
        const availabilityWithSlots = applyExistingSlots({
          availability,
          slots: scheduleSlots,
          range,
          serviceType: schedulingParameters.serviceType.flatMap((cc) => cc.coding).filter(isDefined),
        });

        // Trim off bufferBefore/bufferAfter from availability
        const availabilityWithBuffers = availabilityWithSlots.map((interval) => ({
          start: addMinutes(interval.start, schedulingParameters.bufferBefore),
          end: addMinutes(interval.end, -1 * schedulingParameters.bufferAfter),
        }));

        // Restrict to intervals long enough for the requested duration
        const realAvailability = availabilityWithBuffers.filter(
          (interval) => addMinutes(interval.start, schedulingParameters.duration) <= interval.end
        );

        return [realAvailability, schedulingParameters] as const;
      });

      const intersectingAvailability = allAvailability
        .map((x) => x[0])
        .reduce((acc, val) => overlappingIntervals(acc, val));
      const { serviceType } = schedulingParameterGroup[0];

      return flatMapMax(
        intersectingAvailability,
        (interval, _idx, maxCount) => {
          return findAlignedSlotTimes(interval, {
            alignment: schedulingParameterGroup[0].alignmentInterval,
            offsetMinutes: schedulingParameterGroup[0].alignmentOffset,
            durationMinutes: schedulingParameterGroup[0].duration,
            maxCount,
          }).map((interval) => ({ interval, serviceType }));
        },
        maxCount
      );
    },
    pageSize
  );

  return [results.slice(0, pageSize), schedules];
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
  const serviceType = params['service-type'].split(',');
  const [intervals, schedules] = await handler({
    ...params,
    schedule: [{ reference: `Schedule/${req.params.id}` }],
    'service-type': serviceType,
  });

  const schedule = schedules[0];

  const bundle: Bundle<Slot> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: intervals.map(({ interval, serviceType }) => ({
      resource: {
        resourceType: 'Slot',
        start: interval.start.toISOString(),
        end: interval.end.toISOString(),
        schedule: createReference(schedule),
        status: 'free',
        serviceType: [serviceType],
      },
    })),
  };

  return [allOk, buildOutputParameters(scheduleFindOperation, bundle)];
}

/**
 * Handles HTTP requests for the Appointment $find operation.
 *
 * Endpoints:
 *   [fhir base]/Appointment/$find
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentFindHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<FindParameters>(appointmentFindOperation, req);

  const serviceType = params['service-type'].split(',');
  const scheduleRefs = typeof params.schedule === 'string' ? params.schedule.split(',') : params.schedule;
  const [intervals, schedules] = await handler({
    ...params,
    schedule: scheduleRefs.map((reference) => ({ reference }) as Reference<Schedule>),
    'service-type': serviceType,
  });

  const bundle: Bundle<Appointment> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: intervals.map(({ interval, serviceType }) => ({
      resource: {
        resourceType: 'Appointment',
        status: 'proposed',
        start: interval.start.toISOString(),
        end: interval.end.toISOString(),
        serviceType: [serviceType],
        participant: schedules.map((schedule) => ({
          actor: schedule.actor[0],
          required: 'required',
          status: 'needs-action',
        })),
      },
    })),
  };

  return [allOk, buildOutputParameters(appointmentFindOperation, bundle)];
}
