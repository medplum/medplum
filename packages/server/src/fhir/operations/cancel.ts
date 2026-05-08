// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, Bundle, OperationDefinition, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { withPaths } from '../../util/withpath';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { assertAllLoaded } from './utils/scheduling';

const cancelOperation = {
  resourceType: 'OperationDefinition',
  name: 'cancel',
  status: 'active',
  kind: 'operation',
  code: 'cancel',
  resource: ['Appointment'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    { use: 'in', name: 'appointment-reference', type: 'Reference', min: 1, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type CancelParameters = {
  'appointment-reference': Reference<Appointment>;
};

/**
 * Handles HTTP requests for the Appointment $cancel operation.
 *
 * Endpoints:
 *   [fhir base]/Appointment/$cancel
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentCancelHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<CancelParameters>(cancelOperation, req);

  const updatedResources = await ctx.repo.withTransaction(
    async () => {
      const appointment = await ctx.repo.readReference(params['appointment-reference']);
      const slots = await ctx.repo
        .readReferences(appointment.slot ?? [])
        .then((slots) => withPaths(slots, 'appointment.slot'));
      assertAllLoaded(slots, 'Loading slots failed');

      if (appointment.status !== 'pending' && appointment.status !== 'booked') {
        throw new OperationOutcomeError(badRequest('Appointment is not in cancelable state due to status'));
      }

      appointment.status = 'cancelled';

      const updatedAppointment = await ctx.repo.updateResource(appointment);
      await Promise.all(slots.map((slot) => ctx.repo.deleteResource('Slot', slot.id)));
      return [updatedAppointment];
    },
    { serializable: true }
  );

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: updatedResources.map((resource) => ({ resource })),
  };

  return [allOk, buildOutputParameters(cancelOperation, bundle)];
}
