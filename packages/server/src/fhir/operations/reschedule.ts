// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  arrayify,
  badRequest,
  createReference,
  extractServiceTypeReferences,
  isDefined,
  isReference,
  OperationOutcomeError,
  serviceTypeIncludesService,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, AppointmentParticipant, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { getAuthenticatedContext } from '../../context';
import { addMinutes } from '../../util/date';
import { copyPaths, getPath, withPath, withPaths } from '../../util/withpath';
import type { Repository } from '../repo';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  assertAllLoaded,
  buildAppointmentSlots,
  getSchedulingParametersGroup,
  isAlignedToGrid,
  validateAllAvailability,
} from './utils/scheduling';
import { extractCommonParameters } from './utils/scheduling-parameters';
import { uniqueOn } from './utils/terminology';

const rescheduleOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'Appointment' },
  {
    name: 'reschedule',
    code: 'reschedule',
    parameter: [
      { use: 'in', name: 'start', type: 'dateTime', min: 1, max: '1' },
      { use: 'in', name: 'schedule', type: 'Reference', min: 1, max: '*' },
      { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
    ],
  }
);

type RescheduleParameters = {
  start: string;
  schedule: Reference | Reference[];
};

/**
 * Handles HTTP requests for the Appointment $reschedule operation.
 *
 * Moves an existing Appointment to a new time and/or a new set of Schedules. The Slots held by
 * the current appointment are released before availability is checked, so the time the
 * appointment currently occupies does not block itself.
 *
 * Pass the same `schedule` values used to search with Appointment/$find, plus the `start` chosen
 * from the results. The Slot resources are derived from the scheduling parameters rather than
 * submitted, and every attribute of the stored Appointment other than `start`, `end`,
 * `participant` and `slot` is left untouched — including `status`, since the appointment
 * lifecycle belongs to $hold, $confirm, and $cancel.
 *
 * The service the move is measured against — the duration it runs for, the grid it aligns to,
 * the buffers around it — is read off the Appointment's own `serviceType`, which must name
 * exactly one HealthcareService. It is not an input: changing what a visit *is* is not a move,
 * since the requirements its type carries, and whatever was applied when it was booked, would be
 * left keyed to a type it no longer has. An Appointment recording no service has no scheduling
 * parameters to be measured against at all, and is rejected rather than measured against a
 * service supplied by the caller.
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

  const startDate = new Date(params.start);
  if (Number.isNaN(startDate.valueOf())) {
    throw new OperationOutcomeError(badRequest('Invalid start time', 'Parameters.start'));
  }

  const scheduleRefs: (Reference<Schedule> & { reference: string })[] = [];
  for (const [index, ref] of (arrayify(params.schedule) ?? []).entries()) {
    if (!isReference<Schedule>(ref, 'Schedule')) {
      throw new OperationOutcomeError(badRequest('Invalid schedule reference', `Parameters.schedule[${index}]`));
    }
    scheduleRefs.push(ref);
  }
  // A Schedule named more than once holds its time once, as $book does for repeated
  // Slot schedule references
  const requestedSchedules = uniqueOn(withPaths(scheduleRefs, 'Parameters.schedule'), (ref) => ref.reference);

  const updatedResources = await ctx.repo.withTransaction(
    async (txRepo) => {
      const existingAppointment = await txRepo.readResource<Appointment>('Appointment', appointmentId);
      if (existingAppointment.status !== 'pending' && existingAppointment.status !== 'booked') {
        throw new OperationOutcomeError(
          badRequest(`Appointment cannot be rescheduled in '${existingAppointment.status}' status`)
        );
      }

      // Read, never written: the move is measured against the service the appointment is
      // already on file under, since changing what a visit is would leave its requirements
      // keyed to a type it no longer has. A visit recording no type says nothing about how
      // long it runs or what grid it sits on, so there is nothing to measure the move against.
      const serviceRefs = extractServiceTypeReferences(existingAppointment.serviceType);
      if (serviceRefs.length === 0) {
        throw new OperationOutcomeError(badRequest('Appointment has no service reference', 'Appointment.serviceType'));
      }
      if (serviceRefs.length > 1) {
        throw new OperationOutcomeError(
          badRequest('Appointment has too many service references', 'Appointment.serviceType')
        );
      }
      const healthcareServiceRef = serviceRefs[0];

      const [schedules, services] = await Promise.all([
        txRepo.readReferences(requestedSchedules).then((loaded) => copyPaths(requestedSchedules, loaded)),
        txRepo
          .readReferences([healthcareServiceRef])
          .then((loaded) => loaded.map((service) => withPath(service, 'Appointment.serviceType'))),
      ]);
      assertAllLoaded(schedules, 'Loading schedule failed');
      assertAllLoaded(services, 'Loading HealthcareService failed');
      const healthcareService = services[0];

      const parameterGroup = await getSchedulingParametersGroup(txRepo, schedules, healthcareService);

      schedules.forEach((schedule) => {
        if (!serviceTypeIncludesService(schedule.serviceType, healthcareService)) {
          throw new OperationOutcomeError(
            badRequest('Schedule is not schedulable for requested service type', getPath(schedule))
          );
        }
      });

      const commonParameters = extractCommonParameters([...parameterGroup.values()]);
      if (
        !isAlignedToGrid(startDate, {
          interval: commonParameters.alignmentInterval,
          offset: commonParameters.alignmentOffset,
          timezone: commonParameters.alignmentTimezone,
        })
      ) {
        throw new OperationOutcomeError(
          badRequest('Start time is not aligned to the scheduling grid', 'Parameters.start')
        );
      }

      const interval = { start: startDate, end: addMinutes(startDate, commonParameters.duration) };
      const slots = schedules.flatMap((schedule) => {
        const parameters = parameterGroup.get(schedule);
        assert(parameters);
        return buildAppointmentSlots({ schedule, parameters, interval });
      });

      // A 'pending' appointment holds its time tentatively; keep that after the move
      if (existingAppointment.status === 'pending') {
        for (const slot of slots) {
          if (slot.status === 'busy') {
            slot.status = 'busy-tentative';
          }
        }
      }

      const existingSlots = await txRepo
        .readReferences(existingAppointment.slot ?? [])
        .then((loaded) => withPaths(loaded, 'Appointment.slot'));
      assertAllLoaded(existingSlots, 'Loading slots failed');

      const participant = await resolveParticipants(txRepo, existingAppointment, existingSlots, schedules);

      // Release the time held by this appointment before checking availability, so that
      // reassigning to a new Schedule at the same time isn't blocked by the appointment
      // being reassigned. A failed validation below rolls the deletes back with the transaction.
      await Promise.all(existingSlots.map((slot) => txRepo.deleteResource('Slot', slot.id)));

      await validateAllAvailability(txRepo, withPaths(slots, 'Parameters.schedule'), healthcareService, parameterGroup);

      const createdSlots = new Array<WithId<Slot>>(slots.length);
      for (const [i, slot] of slots.entries()) {
        createdSlots[i] = await txRepo.createResource<Slot>(slot);
      }
      const updatedAppointment = await txRepo.updateResource<Appointment>({
        ...existingAppointment,
        start: interval.start.toISOString(),
        end: interval.end.toISOString(),
        participant,
        slot: createdSlots.map((slot) => createReference(slot)),
      });

      return [updatedAppointment, ...createdSlots];
    },
    { serializable: true, resourceTypes: ['Appointment', 'Slot'], source: 'appointmentRescheduleHandler' }
  );

  const bundle = {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: updatedResources.map((resource) => ({ resource })),
  };

  return [allOk, buildOutputParameters(rescheduleOperation, bundle)];
}

/**
 * Swaps the actors of the Schedules being moved away from for the actors of the new Schedules,
 * leaving every other participant (the patient, related persons) untouched. An actor present on
 * both the old and new Schedules keeps its existing participant entry, and with it any
 * `status` the actor had already responded with.
 *
 * @param repo - Repository to read the outgoing Schedules with.
 * @param existingAppointment - The stored Appointment being rescheduled.
 * @param existingSlots - The Slots currently held by the appointment.
 * @param newSchedules - The Schedules the appointment is moving to.
 * @returns The participant list for the rescheduled appointment.
 */
async function resolveParticipants(
  repo: Repository,
  existingAppointment: Appointment,
  existingSlots: Slot[],
  newSchedules: Schedule[]
): Promise<AppointmentParticipant[]> {
  const oldScheduleRefs = [...new Set(existingSlots.map((slot) => slot.schedule.reference).filter(isDefined))].map(
    (reference) => ({ reference })
  );
  const oldSchedules = await repo
    .readReferences<Schedule>(oldScheduleRefs)
    .then((schedules) => withPaths(schedules, 'Appointment.slot.schedule'));
  assertAllLoaded(oldSchedules, 'Loading schedules for existing slots failed');

  const replacedRefs = new Set(oldSchedules.flatMap((s) => s.actor.map((actor) => actor.reference)).filter(isDefined));

  // Two Schedules can name the same actor, so dedupe to avoid emitting it twice
  const newActors = [
    ...new Map(newSchedules.flatMap((schedule) => schedule.actor).map((actor) => [actor.reference, actor])).values(),
  ];
  const newRefs = new Set(newActors.map((actor) => actor.reference).filter(isDefined));

  const kept = existingAppointment.participant.filter(
    (p) => !p.actor?.reference || !replacedRefs.has(p.actor.reference) || newRefs.has(p.actor.reference)
  );
  const keptRefs = new Set(kept.map((p) => p.actor?.reference).filter(isDefined));

  return [
    ...kept,
    ...newActors
      .filter((actor) => actor.reference && !keptRefs.has(actor.reference))
      .map((actor) => ({ actor, required: 'required', status: 'needs-action' }) as const),
  ];
}
