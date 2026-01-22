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

  const schedules = await ctx.repo.readReferences(slots.map((slot) => slot.schedule));
  schedules.forEach((schedule, index) => {
    if (schedule instanceof Error) {
      throw new OperationOutcomeError(badRequest('Schedule load failed', `Parameters.parameter[${index}].schedule`));
    }
  });

  const bundle: Bundle<Slot> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: [],
  };

  return [created, buildOutputParameters(bookOperation, bundle)];
}
