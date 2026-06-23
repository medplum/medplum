// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { created } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { withPath } from '../../util/withpath';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { createProposedAppointment } from './utils/scheduling';

const bookOperation = makeOperationDefinition(
  { scope: 'type', resource: 'Appointment' },
  {
    name: 'book',
    code: 'book',
    parameter: [
      { use: 'in', name: 'appointment', type: 'Appointment', min: 1, max: '1' },
      { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
    ],
  }
);

type BookParameters = {
  appointment: Appointment;
};

/**
 * Handles HTTP requests for the Appointment $book operation.
 *
 * Endpoints:
 *   [fhir base]/Appointment/$book
 *
 * @experimental - Scheduling Alpha API
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentBookHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<BookParameters>(bookOperation, req);
  const bundle = await createProposedAppointment(
    ctx.repo,
    withPath(params.appointment, 'Parameters.appointment'),
    (appointment) => {
      // Create appointment with "booked" status
      appointment.status = 'booked';
    }
  );

  return [created, buildOutputParameters(bookOperation, bundle)];
}
