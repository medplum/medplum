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

// Helper that tests a condition that we believe should always be true.
//
// This allows programmers to make an assertion to the type system that
// TypeScript can't natively infer. It will throw a runtime error if the
// assertion is ever violated.
//
// Example: After applying a filter to a query that requires the existence of a
// field, you can use invariant to tell TS that the object must have that
// attribute.
//
// ```
//   const user = systemRepo.searchOne<User>({
//     resourceType: 'User',
//     filters: [{ code: 'email', operator: Operator.EQUALS, value: 'alice@example.com' }]
//   });
//
//   invariant(user.email); // refines user.email from `string | undefined` to `string`
//   const result: string = user.email.toLowerCase()
// ```
function invariant(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg ?? 'Invariant violation');
  }
}

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
  const { slot: slots } = params;

  const start = assertAllMatch(
    slots.map((slot) => slot.start),
    'Mismatched slot start times'
  );
  const end = assertAllMatch(
    slots.map((slot) => slot.end),
    'Mismatched slot end times'
  );

  const startDate = new Date(start);
  const endDate = new Date(end);

  const durationMs = endDate.getTime() - startDate.getTime();
  const durationMinutes = durationMs / 1000 / 60;

  const schedules = await ctx.repo.readReferences(slots.map((slot) => slot.schedule));
  assertAllOk(schedules, 'Schedule load failed', 'Parameters.parameter[%i].schedule');

  schedules.forEach((schedule) => {
    if (schedule.actor.length !== 1) {
      throw new OperationOutcomeError(badRequest('$book only supported on schedules with exactly one actor'));
    }
  });

  const actors = await ctx.repo.readReferences(schedules.flatMap((schedule) => schedule.actor));
  assertAllOk(actors, 'Schedule.actor load failed', 'Parameters.parameter[%i].schedule.actor');

  const createdResources = await ctx.repo.withTransaction(
    async () => {
      await Promise.all(
        slots.map(async (slot, index) => {
          const schedule = schedules.find((s) => `Schedule/${s.id}` === slot.schedule.reference);
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
          const matcher = makeMatcher(slot);
          let parameters = extensions.filter((ext) => matcher(ext));
          if (parameters.length === 0) {
            // If no service type match found, fall back to wildcard availability
            parameters = extensions.filter((ext) => ext.serviceType.length === 0);
          }

          parameters = parameters.filter((ext) => ext.duration === durationMinutes);
          parameters = parameters.filter((ext) =>
            isAlignedTime(startDate, { alignment: ext.alignmentInterval, offsetMinutes: ext.alignmentOffset })
          );

          if (parameters.length === 0) {
            throw new OperationOutcomeError(badRequest('No matching scheduling parameters found'));
          }

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
                value: `((start ge "${start}" and start le "${end}") or (end ge "${start}" and end le "${end}") or (start lt "${start}" and end gt "${end}"))`,
              },
            ],
          });

          // If we filled a full search page of slots, then there may be slots we
          // didn't fetch that would impact availability. Fail loudly here.
          if (existingSlots.length === DEFAULT_MAX_SEARCH_COUNT) {
            throw new OperationOutcomeError(badRequest('Too many existing slots found in range. Try another time.'));
          }

          const availableSlots = existingSlots.filter((slot) => slot.status === 'free');
          const blockedSlots = existingSlots.filter((slot) => slot.status !== 'free');

          if (blockedSlots.length > 0) {
            throw new OperationOutcomeError(conflict('Availability conflict'));
          }

          const range = { start: new Date(start), end: new Date(end) };
          const serviceType = (slot.serviceType ?? EMPTY).flatMap((concept) => concept.coding ?? EMPTY);
          const activeParameters = parameters.find((params) => {
            const timeZone = params.timezone ?? actorTimeZone;
            const availability = resolveAvailability(params, range, timeZone);
            const result = applyExistingSlots({
              availability,
              slots: availableSlots,
              range,
              serviceType,
            });

            return (
              result[0] &&
              result[0].start.getTime() <= range.start.getTime() &&
              result[0].end.getTime() >= range.end.getTime()
            );
          });

          if (!activeParameters) {
            throw new OperationOutcomeError(badRequest('No availability found at this time'));
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
        slots.map((slot) =>
          ctx.repo.createResource({
            ...slot,
            status: 'busy',
          })
        )
      );
      return [appointment, ...createdSlots];
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
