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

const holdOperation = makeOperationDefinition(
  { scope: 'type', resource: 'Appointment' },
  {
    name: 'hold',
    code: 'hold',
    parameter: [
      { use: 'in', name: 'appointment', type: 'Appointment', min: 1, max: '1' },
      { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
    ],
  }
);

type HoldParameters = {
  appointment: Appointment;
};

/**
 * Handles HTTP requests for the Appointment $hold operation.
 *
 * Endpoints:
 *   [fhir base]/Appointment/$hold
 *
 * @experimental - Scheduling Beta API
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentHoldHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<HoldParameters>(holdOperation, req);
  const bundle = await createProposedAppointment(
    ctx.repo,
    withPath(params.appointment, 'Parameters.appointment'),
    (appointment, slots) => {
      // Create appointment with "pending" status
      appointment.status = 'pending';

      // $hold creates slots with "busy-tentative" status
      for (const slot of slots) {
        if (slot.status === 'busy') {
          slot.status = 'busy-tentative';
        }
      }
    }
  );

  return [created, buildOutputParameters(holdOperation, bundle)];
}
