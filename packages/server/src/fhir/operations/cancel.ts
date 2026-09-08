// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { withPaths } from '../../util/withpath';
import type { Repository } from '../repo';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { assertAllLoaded } from './utils/scheduling';

const cancelOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'Appointment' },
  {
    name: 'cancel',
    code: 'cancel',
    parameter: [{ use: 'out', name: 'return', type: 'Appointment', min: 1, max: '1' }],
  }
);

type CancelParameters = {};

/**
 * Cancels an Appointment and deletes the Slot resources it occupies.
 * Must be called inside a transaction so concurrent booking cannot race.
 *
 * @param repo - The repository to use (typically a transaction-scoped repo).
 * @param appointmentId - The Appointment id to cancel.
 * @returns The updated Appointment with status `cancelled`.
 */
export async function cancelAppointment(repo: Repository, appointmentId: string): Promise<Appointment> {
  const appointment = await repo.readResource<Appointment>('Appointment', appointmentId);
  const slots = await repo.readReferences(appointment.slot ?? []).then((slots) => withPaths(slots, 'appointment.slot'));
  assertAllLoaded(slots, 'Loading slots failed');

  if (appointment.status !== 'pending' && appointment.status !== 'booked') {
    throw new OperationOutcomeError(badRequest(`Appointment cannot be canceled in '${appointment.status}' status`));
  }

  appointment.status = 'cancelled';

  const updatedAppointment = await repo.updateResource(appointment);
  await Promise.all(slots.map((slot) => repo.deleteResource('Slot', slot.id)));
  return updatedAppointment;
}

/**
 * Handles HTTP requests for the Appointment $cancel operation.
 *
 * Endpoints:
 *   [fhir base]/Appointment/:id/$cancel
 *
 * @experimental - Scheduling Beta API
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentCancelHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  parseInputParameters<CancelParameters>(cancelOperation, req);
  const appointmentId = req.params.id;

  const updatedAppointment = await ctx.repo.withTransaction(
    async (txRepo) => cancelAppointment(txRepo, appointmentId),
    {
      resourceTypes: ['Appointment', 'Slot'],
      source: 'appointmentCancelHandler',
      serializable: true,
    }
  );

  return [allOk, buildOutputParameters(cancelOperation, updatedAppointment)];
}
