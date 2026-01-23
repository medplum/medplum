// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, conflict, created, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, OperationDefinition, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

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

  const schedules = await ctx.repo.readReferences(slots.map((slot) => slot.schedule));
  assertAllOk(schedules, 'Schedule load failed', 'Parameters.parameter[%i].schedule');

  const createdResources = await ctx.repo.withTransaction(
    async () => {
      await Promise.all(
        slots.map(async (slot) => {
          const schedule = getReferenceString(slot.schedule);
          invariant(schedule, 'Slot missing schedule reference after load succeeded');

          const existingSlots = await ctx.repo.searchResources<Slot>({
            resourceType: 'Slot',
            count: 1,
            filters: [
              {
                code: 'schedule',
                operator: Operator.EQUALS,
                value: schedule,
              },
              {
                code: 'status',
                operator: Operator.EQUALS,
                value: 'busy,busy-tentative,busy-unavailable',
              },
              {
                code: '_filter',
                operator: Operator.EQUALS,
                value: `((start ge "${start}" and start le "${end}") or (end ge "${start}" and end le "${end}") or (start lt "${start}" and end gt "${end}"))`,
              },
            ],
          });

          if (existingSlots.length > 0) {
            throw new OperationOutcomeError(conflict('Availability conflict'));
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
