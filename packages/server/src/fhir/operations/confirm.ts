// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, extractServiceTypeReferences, flatMapFilter, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { copyPaths, getPath, withPath, withPaths } from '../../util/withpath';
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
 * @experimental - Scheduling Beta API
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

      // Don't allow confirming an appointment for a service that has been deactivated.
      const serviceRefs = flatMapFilter(appointment.serviceType, (concept, idx) => {
        const [reference] = extractServiceTypeReferences([concept]);
        return reference ? withPath(reference, `Appointment.serviceType[${idx}]`) : undefined;
      });
      const services = await txRepo.readReferences(serviceRefs).then((services) => copyPaths(serviceRefs, services));
      assertAllLoaded(services, 'Loading HealthcareService failed');
      for (const service of services) {
        if (service.active === false) {
          throw new OperationOutcomeError(badRequest('HealthcareService is inactive', getPath(service)));
        }
      }

      // Fetch slots
      const slots = await txRepo
        .readReferences(appointment.slot ?? [])
        .then((slots) => withPaths(slots, 'Appointment.slot'));
      assertAllLoaded(slots, 'Loading slots failed');

      // Don't allow confirming an appointment on a schedule that has been deactivated.
      // Buffer slots share a schedule with the appointment slot, so dedupe the references,
      // keeping the path of the first slot that points at each schedule.
      const seenScheduleRefs = new Set<string | undefined>();
      const uniqueScheduleSlots = slots.filter((slot) => {
        const seen = seenScheduleRefs.has(slot.schedule.reference);
        seenScheduleRefs.add(slot.schedule.reference);
        return !seen;
      });
      const schedules = await txRepo
        .readReferences(uniqueScheduleSlots.map((slot) => slot.schedule))
        .then((schedules) => copyPaths(uniqueScheduleSlots, schedules, { suffix: '.schedule' }));
      assertAllLoaded(schedules, 'Loading Schedule failed');
      for (const schedule of schedules) {
        if (schedule.active === false) {
          throw new OperationOutcomeError(badRequest('Schedule is inactive', getPath(schedule)));
        }
      }

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
    {
      serializable: true,
      resourceTypes: ['Appointment', 'HealthcareService', 'Schedule', 'Slot'],
      source: 'appointmentConfirm',
    }
  );
  const bundle = {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: updatedResources.map((resource) => ({ resource })),
  };
  return [allOk, buildOutputParameters(confirmOperation, bundle)];
}
