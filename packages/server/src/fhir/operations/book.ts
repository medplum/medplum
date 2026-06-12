// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  badRequest,
  conflict,
  created,
  EMPTY,
  getReferenceString,
  isNotFound,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, Bundle, HealthcareService, Patient, Reference, Slot } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { getAuthenticatedContext } from '../../context';
import { addMinutes, areIntervalsOverlapping } from '../../util/date';
import { getServiceTypeReferences } from '../../util/servicetype';
import { copyPaths, withPath, withPaths } from '../../util/withpath';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  applyExistingSlots,
  assertAllLoaded,
  assertAllMatch,
  createProposedAppointment,
  getSchedulingParametersGroup,
  resolveAvailability,
  slotsOverlappingInterval,
} from './utils/scheduling';

const bookOperation = makeOperationDefinition(
  { scope: 'type', resource: 'Appointment' },
  {
    name: 'book',
    code: 'book',
    parameter: [
      { use: 'in', name: 'appointment', type: 'Appointment', min: 0, max: '1' },
      { use: 'in', name: 'slot', type: 'Resource', min: 0, max: '*' },
      { use: 'in', name: 'patient-reference', type: 'Reference', min: 0, max: '1' },
      { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
    ],
  }
);

type BookParameters = {
  appointment?: Appointment;
  slot: Slot[];
  'patient-reference'?: Reference<Patient>;
};

function serviceTypeTokens(slots: Slot[]): string[] {
  const tokenSet = new Set<string>();
  for (const slot of slots) {
    for (const concept of slot.serviceType ?? EMPTY) {
      for (const coding of concept.coding ?? EMPTY) {
        tokenSet.add(`${coding.system ?? ''}|${coding.code ?? ''}`);
      }
    }
  }
  return [...tokenSet.values()];
}

async function bookFromProposedAppointmentHandler(proposedAppointment: Appointment): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const bundle = await createProposedAppointment(
    ctx.repo,
    withPath(proposedAppointment, 'Parameters.appointment'),
    (appointment, _slots) => {
      // Create appointment with "booked" status
      appointment.status = 'booked';
    }
  );

  return [created, buildOutputParameters(bookOperation, bundle)];
}

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

  if (params.appointment) {
    if (params.slot.length) {
      throw new OperationOutcomeError(badRequest('Received exclusive parameters `slot` and `appointment`'));
    }
    if (params['patient-reference']) {
      throw new OperationOutcomeError(
        badRequest('`patient-reference` parameter not allowed with `appointment` parameter')
      );
    }

    return bookFromProposedAppointmentHandler(params.appointment);
  }

  const proposedSlots = withPaths(params.slot, 'Parameters.slot');

  assertAllMatch(proposedSlots, 'start', 'Mismatched slot start times');
  assertAllMatch(proposedSlots, 'end', 'Mismatched slot end times');
  const { start, end } = proposedSlots[0];
  const startDate = new Date(start);
  const endDate = new Date(end);

  // We intend to remove the older `Slot` based approach beyond here, probably
  // around when we transition into the scheduling "beta" milestone. For now
  // we support the original implementation path as well.

  if (params['patient-reference']) {
    // validate that the patient reference exists and is visible to the caller
    try {
      await ctx.repo.readReference(params['patient-reference']);
    } catch (err: unknown) {
      // convert from 404 not-found to 400 bad-request
      if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
        throw new OperationOutcomeError(badRequest('Invalid patient-reference'));
      }
      throw err;
    }
  }

  const schedules = await ctx.repo
    .readReferences(proposedSlots.map((slot) => slot.schedule))
    .then((schedules) => copyPaths(proposedSlots, schedules, { suffix: '.schedule' }));
  assertAllLoaded(schedules, 'Schedule load failed');

  let healthcareService: WithId<HealthcareService>;
  // We expect that at most one unique serviceType reference will be found
  const serviceRefs = proposedSlots.flatMap((slot) => getServiceTypeReferences(slot));
  assertAllMatch(serviceRefs, 'reference', 'Mismatched service types');

  const serviceRefString = serviceRefs[0]?.reference;
  if (serviceRefString) {
    try {
      healthcareService = await ctx.repo.readReference({ reference: serviceRefString });
    } catch (err) {
      if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
        throw new OperationOutcomeError(badRequest('HealthcareService not found'));
      }
      throw err;
    }
  } else {
    // Collect all unique service type codes across all proposed slots, then fetch
    // matching HealthcareService resources in a single query.
    //
    // Q: Do we support this style or require the CodeableReference style above?
    const allServiceTypes = serviceTypeTokens(proposedSlots);

    const healthcareServices: WithId<HealthcareService>[] =
      allServiceTypes.length > 0
        ? await ctx.repo.searchResources<HealthcareService>({
            resourceType: 'HealthcareService',
            filters: [{ code: 'service-type', operator: Operator.EQUALS, value: allServiceTypes.join(',') }],
          })
        : [];

    if (healthcareServices.length === 0) {
      throw new OperationOutcomeError(badRequest('No matching HealthcareService found'));
    }

    if (healthcareServices.length > 1) {
      throw new OperationOutcomeError(badRequest('Multiple matching HealthcareServices found'));
    }
    healthcareService = healthcareServices[0];
  }

  const parameterGroup = await getSchedulingParametersGroup(
    ctx.repo,
    schedules,
    withPath(healthcareService, 'Parameters.service-type-reference')
  );

  const createdResources = await ctx.repo.withTransaction(
    async () => {
      const bufferSlots: Slot[] = [];

      await Promise.all(
        proposedSlots.map(async (proposedSlot) => {
          const scheduleRefString = getReferenceString(proposedSlot.schedule);
          const schedule = schedules.find((s) => `Schedule/${s.id}` === scheduleRefString);
          assert(schedule, 'Slot.schedule not loaded');
          const durationMinutes = (Date.parse(proposedSlot.end) - Date.parse(proposedSlot.start)) / 60000;
          const parameters = parameterGroup.get(schedule);
          assert(parameters);

          if (parameters.duration !== durationMinutes) {
            throw new OperationOutcomeError(badRequest('No matching scheduling parameters found'));
          }

          const range = {
            start: addMinutes(startDate, -1 * parameters.bufferBefore),
            end: addMinutes(endDate, parameters.bufferAfter),
          };
          const searchStart = range.start.toISOString();
          const searchEnd = range.end.toISOString();

          const existingSlots = await slotsOverlappingInterval(ctx.repo, [schedule], range);

          // If there exists busy slots overlapping with the requested booking time,
          // we can bail out now with an informative error message.
          const explicitOverlap = existingSlots.find((existingSlot) => {
            return (
              existingSlot.status !== 'free' &&
              areIntervalsOverlapping(
                { start: startDate, end: endDate },
                { start: new Date(existingSlot.start), end: new Date(existingSlot.end) }
              )
            );
          });
          if (explicitOverlap) {
            throw new OperationOutcomeError(conflict('Requested time slot is no longer available'));
          }

          const availability = applyExistingSlots({
            availability: resolveAvailability(parameters, range, parameters.timezone),
            slots: existingSlots,
            range,
            serviceType: healthcareService.type,
          });

          const hasAvailability = availability.some(
            (interval) => interval.start <= range.start && interval.end >= range.end
          );

          if (!hasAvailability) {
            throw new OperationOutcomeError(badRequest('No availability found at this time'));
          }

          if (parameters.bufferBefore) {
            bufferSlots.push({
              resourceType: 'Slot',
              status: 'busy-unavailable',
              start: searchStart,
              end: startDate.toISOString(),
              schedule: proposedSlot.schedule,
            });
          }

          if (parameters.bufferAfter) {
            bufferSlots.push({
              resourceType: 'Slot',
              status: 'busy-unavailable',
              start: endDate.toISOString(),
              end: searchEnd,
              schedule: proposedSlot.schedule,
            });
          }
        })
      );

      const participant: Appointment['participant'] = schedules.map((schedule) => ({
        actor: schedule.actor[0],
        status: 'tentative',
      }));

      if (params['patient-reference']) {
        participant.push({
          actor: params['patient-reference'],
          status: 'accepted',
        });
      }

      const createdSlots = await Promise.all(
        proposedSlots.map((slot) =>
          ctx.repo.createResource({
            ...slot,
            status: 'busy',
          })
        )
      );
      const createdBufferSlots = await Promise.all(bufferSlots.map((slot) => ctx.repo.createResource(slot)));

      const appointment = await ctx.repo.createResource<Appointment>({
        resourceType: 'Appointment',
        status: 'booked',
        slot: createdSlots.map((slot) => ({ reference: getReferenceString(slot) })),
        participant,
        start,
        end,
      });
      return [appointment, ...createdSlots, ...createdBufferSlots];
    },
    { serializable: true }
  );

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: createdResources.map((resource) => ({ resource })),
  };

  return [created, buildOutputParameters(bookOperation, bundle)];
}
