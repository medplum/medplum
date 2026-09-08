// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { created } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { withPath } from '../../util/withpath';
import { cancelAppointment } from './cancel';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { createProposedAppointment } from './utils/scheduling';

const rescheduleOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'Appointment' },
  {
    name: 'reschedule',
    code: 'reschedule',
    parameter: [
      { use: 'in', name: 'appointment', type: 'Appointment', min: 1, max: '1' },
      { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
    ],
  }
);

type RescheduleParameters = {
  appointment: Appointment;
};

/**
 * Handles HTTP requests for the Appointment $reschedule operation.
 *
 * Atomically cancels the existing Appointment and books a new one in a single
 * transaction, equivalent to `$cancel` followed by `$book`.
 *
 * Endpoints:
 *   [fhir base]/Appointment/:id/$reschedule
 *
 * @experimental - Scheduling Beta API
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentRescheduleHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<RescheduleParameters>(rescheduleOperation, req);
  const appointmentId = req.params.id;

  const bundle = await createProposedAppointment(
    ctx.repo,
    withPath(params.appointment, 'Parameters.appointment'),
    (appointment) => {
      appointment.status = 'booked';
    },
    {
      beforeCreate: async (txRepo) => {
        await cancelAppointment(txRepo, appointmentId);
      },
    }
  );

  return [created, buildOutputParameters(rescheduleOperation, bundle)];
}
