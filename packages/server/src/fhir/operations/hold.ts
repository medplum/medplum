// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, created, createReference, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, Bundle, OperationDefinition, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { withPath } from '../../util/withpath';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { validateAllAvailability, validateProposedAppointment } from './utils/scheduling';

const holdOperation = {
  resourceType: 'OperationDefinition',
  name: 'hold',
  status: 'active',
  kind: 'operation',
  code: 'hold',
  resource: ['Appointment'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    { use: 'in', name: 'appointment', type: 'Appointment', min: 1, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type HoldParameters = {
  appointment: Appointment;
};

/**
 * Handles HTTP requests for the Appointment $hold operation.
 *
 * Endpoints:
 *   [fhir base]/Appointment/$hold
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentHoldHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<HoldParameters>(holdOperation, req);
  const [appointment, slots, healthcareService, schedulingParametersGroup] = await validateProposedAppointment(
    ctx.repo,
    withPath(params.appointment, 'Parameters.appointment')
  );

  // We will write this attribute later, check that we aren't clobbering something that was submitted
  if (appointment.slot) {
    throw new OperationOutcomeError(
      badRequest('Proposed appointment must not have Slot references', 'Parameters.appointment.slot')
    );
  }

  // $hold creates slots in "busy-tentative" state
  for (const slot of slots) {
    if (slot.status === 'busy') {
      slot.status = 'busy-tentative';
    }
  }

  const createdResources = await ctx.repo.withTransaction(
    async () => {
      await validateAllAvailability(ctx.repo, slots, healthcareService, schedulingParametersGroup);

      const createdSlots: Slot[] = [];
      for (const slot of slots) {
        createdSlots.push(await ctx.repo.createResource<Slot>(slot));
      }

      const createdAppointment = await ctx.repo.createResource<Appointment>({
        ...appointment,
        status: 'pending',
        slot: createdSlots.map((slot) => createReference(slot)),
      });
      return [createdAppointment, ...createdSlots];
    },
    { serializable: true }
  );
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: createdResources.map((resource) => ({ resource })),
  };

  return [created, buildOutputParameters(holdOperation, bundle)];
}
