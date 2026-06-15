// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { withPaths } from '../../util/withpath';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters } from './utils/parameters';
import { assertAllLoaded } from './utils/scheduling';

const confirmOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'Appointment' },
  {
    name: 'confirm',
    code: 'confirm',
    parameter: [{ use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' }],
  }
);

/**
 * Handles HTTP requests for the Appointment $confirm operation.
 *
 * Marks an Appointment created via `$hold` as "booked".
 *
 * Endpoints:
 *   [fhir base]/Appointment/:id/$confirm
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentConfirmHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const appointmentId = req.params.id;
  const updatedResources = await ctx.repo.withTransaction(
    async (txRepo) => {
      const appointment = await txRepo.readResource<Appointment>('Appointment', appointmentId);
      if (appointment.status !== 'pending' && appointment.status !== 'proposed') {
        throw new OperationOutcomeError(
          badRequest(`Appointment cannot be confirmed in '${appointment.status}' status`)
        );
      }

      // Fetch slots
      const slots = await txRepo
        .readReferences(appointment.slot ?? [])
        .then((slots) => withPaths(slots, 'Appointment.slot'));
      assertAllLoaded(slots, 'Loading slots failed');

      // Mark `busy-tentative` slots as `busy`
      const updatedSlots = await Promise.all(
        slots.map(async (slot) =>
          slot.status === 'busy-tentative' ? txRepo.updateResource<Slot>({ ...slot, status: 'busy' }) : slot
        )
      );

      // Set appointment.status to `booked`
      const updatedAppointment = await txRepo.updateResource<Appointment>({ ...appointment, status: 'booked' });

      return [updatedAppointment, ...updatedSlots];
    },
    { serializable: true }
  );
  const bundle = {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: updatedResources.map((resource) => ({ resource })),
  };
  return [allOk, buildOutputParameters(confirmOperation, bundle)];
}
