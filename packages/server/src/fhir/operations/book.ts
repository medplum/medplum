// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  conflict,
  created,
  DEFAULT_MAX_SEARCH_COUNT,
  EMPTY,
  getReferenceString,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, OperationDefinition, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { addMinutes, areIntervalsOverlapping } from '../../util/date';
import { invariant } from '../../util/invariant';
import { isAlignedTime } from './utils/book';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { applyExistingSlots, getTimeZone, resolveAvailability } from './utils/scheduling';
import type { SchedulingParameters } from './utils/scheduling-parameters';
import { parseSchedulingParametersExtensions } from './utils/scheduling-parameters';

const bookOperation = {
  resourceType: 'OperationDefinition',
  name: 'book',
  status: 'active',
  kind: 'operation',
  code: 'book',
  resource: ['Appointment'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    { use: 'in', name: 'slot', type: 'Resource', min: 1, max: '*' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type BookParameters = {
  slot: Slot[];
};

type Matcher = (params: SchedulingParameters) => boolean;

function assertAllOk<T>(objects: (Error | T)[], msg: string, path?: string): asserts objects is T[] {
  objects.forEach((obj, idx) => {
    if (obj instanceof Error) {
      throw new OperationOutcomeError(badRequest(msg, path?.replace('%i', idx.toString())));
    }
  });
}

function assertAllMatch<T>(objects: T[], msg: string): T {
  const first = objects[0];
  if (objects.some((obj) => obj !== first)) {
    throw new OperationOutcomeError(badRequest(msg));
  }
  return first;
}

function makeMatcher(slot: Slot): Matcher {
  const codes = (slot.serviceType ?? EMPTY).flatMap((concept) =>
    (concept.coding ?? EMPTY).map((coding) => `${coding.system}|${coding.code}`)
  );
  const codeSet = new Set(codes);
  return (schedulingParams: SchedulingParameters) => {
    return schedulingParams.serviceType.some((coding) => {
      return codeSet.has(`${coding.system}|${coding.code}`);
    });
  };
}

function findMatchingSchedulingParameters(extensions: SchedulingParameters[], slot: Slot): SchedulingParameters[] {
  const matcher = makeMatcher(slot);
  let parameters = extensions.filter((ext) => matcher(ext));
  if (parameters.length === 0) {
    // If no service type match found, fall back to wildcard availability
    parameters = extensions.filter((ext) => ext.serviceType.length === 0);
  }

  const startDate = new Date(slot.start);
  const endDate = new Date(slot.end);

  const durationMs = endDate.getTime() - startDate.getTime();
  const durationMinutes = durationMs / 1000 / 60;

  parameters = parameters.filter((ext) => ext.duration === durationMinutes);
  parameters = parameters.filter((ext) =>
    isAlignedTime(startDate, { alignment: ext.alignmentInterval, offsetMinutes: ext.alignmentOffset })
  );
  return parameters;
}

function chooseActiveParameters(
  proposedSlot: Slot,
  parameters: SchedulingParameters[],
  actorTimeZone: string,
  existingSlots: Slot[]
): SchedulingParameters | undefined {
  const startDate = new Date(proposedSlot.start);
  const endDate = new Date(proposedSlot.end);
  const serviceType = (proposedSlot.serviceType ?? EMPTY).flatMap((concept) => concept.coding ?? EMPTY);
  return parameters.find((params) => {
    const timeZone = params.timezone ?? actorTimeZone;
    const range = {
      start: addMinutes(startDate, -1 * params.bufferBefore),
      end: addMinutes(endDate, params.bufferAfter),
    };
    const availability = resolveAvailability(params, range, timeZone);
    const result = applyExistingSlots({
      availability,
      slots: existingSlots,
      range,
      serviceType,
    });
    return result.some(
      (interval) => interval.start.getTime() <= range.start.getTime() && interval.end.getTime() >= range.end.getTime()
    );
  });
}

/**
 * Handles HTTP requests for the Appointment $book operation.
 *
 * Endpoints:
 *   [fhir base]/Appointment/$book
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentBookHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<BookParameters>(bookOperation, req);
  const proposedSlots = params.slot;

  const start = assertAllMatch(
    proposedSlots.map((slot) => slot.start),
    'Mismatched slot start times'
  );
  const end = assertAllMatch(
    proposedSlots.map((slot) => slot.end),
    'Mismatched slot end times'
  );

  const startDate = new Date(start);
  const endDate = new Date(end);

  const schedules = await ctx.repo.readReferences(proposedSlots.map((slot) => slot.schedule));
  assertAllOk(schedules, 'Schedule load failed', 'Parameters.parameter[%i].schedule');

  schedules.forEach((schedule) => {
    if (schedule.actor.length !== 1) {
      throw new OperationOutcomeError(badRequest('$book only supported on schedules with exactly one actor'));
    }
  });

  const actors = await ctx.repo.readReferences(schedules.flatMap((schedule) => schedule.actor));
  assertAllOk(actors, 'Schedule.actor load failed', 'Parameters.parameter[%i].schedule.actor');

  const bufferSlots: Slot[] = [];

  const createdResources = await ctx.repo.withTransaction(
    async () => {
      await Promise.all(
        proposedSlots.map(async (proposedSlot, index) => {
          const schedule = schedules.find((s) => `Schedule/${s.id}` === proposedSlot.schedule.reference);
          invariant(schedule, 'Slot.schedule not loaded');

          const actor = actors.find((a) => `${a.resourceType}/${a.id}` === schedule.actor[0].reference);
          invariant(actor, 'Slot.schedule.actor not loaded');
          const actorTimeZone = getTimeZone(actor);
          if (!actorTimeZone) {
            throw new OperationOutcomeError(
              badRequest('No timezone specified', `Parameters.parameter[${index}].schedule.actor`)
            );
          }

          const extensions = parseSchedulingParametersExtensions(schedule);
          const parameters = findMatchingSchedulingParameters(extensions, proposedSlot);

          if (parameters.length === 0) {
            throw new OperationOutcomeError(badRequest('No matching scheduling parameters found'));
          }

          const bufferBeforeMax = Math.max(...parameters.map((p) => p.bufferBefore));
          const bufferAfterMax = Math.max(...parameters.map((p) => p.bufferAfter));

          const searchStart = addMinutes(startDate, -1 * bufferBeforeMax).toISOString();
          const searchEnd = addMinutes(endDate, bufferAfterMax).toISOString();

          const existingSlots = await ctx.repo.searchResources<Slot>({
            resourceType: 'Slot',
            count: DEFAULT_MAX_SEARCH_COUNT,
            filters: [
              {
                code: 'schedule',
                operator: Operator.EQUALS,
                value: getReferenceString(schedule),
              },
              {
                code: 'status',
                operator: Operator.EQUALS,
                value: 'busy,busy-tentative,busy-unavailable,free',
              },
              {
                code: '_filter',
                operator: Operator.EQUALS,
                value: `((start ge "${searchStart}" and start le "${searchEnd}") or (end ge "${searchStart}" and end le "${searchEnd}") or (start lt "${searchStart}" and end gt "${searchEnd}"))`,
              },
            ],
          });

          // If we filled a full search page of slots, then there may be slots we
          // didn't fetch that would impact availability. Fail loudly here.
          if (existingSlots.length === DEFAULT_MAX_SEARCH_COUNT) {
            throw new OperationOutcomeError(badRequest('Too many existing slots found in range. Try another time.'));
          }

          // If there exists busy slots overlapping with the requested booking time,
          // we can bail out now with an informative error message.
          const explicitOverlap = existingSlots.find((existingSlot) => {
            return (
              existingSlot.status !== 'free' &&
              areIntervalsOverlapping(
                { start: startDate, end: endDate },
                { start: new Date(existingSlot.start), end: new Date(existingSlot.end) }
              )
            );
          });
          if (explicitOverlap) {
            throw new OperationOutcomeError(conflict('Requested time slot is no longer available'));
          }

          const activeParameters = chooseActiveParameters(proposedSlot, parameters, actorTimeZone, existingSlots);

          if (!activeParameters) {
            throw new OperationOutcomeError(badRequest('No availability found at this time'));
          }

          if (activeParameters.bufferBefore) {
            bufferSlots.push({
              resourceType: 'Slot',
              status: 'busy-unavailable',
              start: addMinutes(startDate, -1 * activeParameters.bufferBefore).toISOString(),
              end: startDate.toISOString(),
              schedule: proposedSlot.schedule,
            });
          }

          if (activeParameters.bufferAfter) {
            bufferSlots.push({
              resourceType: 'Slot',
              status: 'busy-unavailable',
              start: endDate.toISOString(),
              end: addMinutes(endDate, activeParameters.bufferAfter).toISOString(),
              schedule: proposedSlot.schedule,
            });
          }
        })
      );

      const appointment = await ctx.repo.createResource({
        resourceType: 'Appointment',
        status: 'booked',
        participant: schedules.map((schedule) => ({
          actor: schedule.actor[0],
          status: 'tentative',
        })),
        start,
        end,
      });
      const createdSlots = await Promise.all(
        proposedSlots.map((slot) =>
          ctx.repo.createResource({
            ...slot,
            status: 'busy',
          })
        )
      );
      const createdBufferSlots = await Promise.all(bufferSlots.map((slot) => ctx.repo.createResource(slot)));
      return [appointment, ...createdSlots, ...createdBufferSlots];
    },
    { serializable: true }
  );

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: createdResources.map((resource) => ({ resource })),
  };

  return [created, buildOutputParameters(bookOperation, bundle)];
}
