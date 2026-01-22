// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, created, OperationOutcomeError } from '@medplum/core';
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

  const createdResources = await ctx.repo.withTransaction(async () => {
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
  });

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: createdResources.map((resource) => ({ resource })),
  };

  return [created, buildOutputParameters(bookOperation, bundle)];
}
