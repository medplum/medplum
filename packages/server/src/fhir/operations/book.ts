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
import type {
  Appointment,
  Bundle,
  HealthcareService,
  OperationDefinition,
  Patient,
  Reference,
  Slot,
} from '@medplum/fhirtypes';
import assert from 'node:assert';
import { getAuthenticatedContext } from '../../context';
import { addMinutes, areIntervalsOverlapping } from '../../util/date';
import { getServiceTypeReferences } from '../../util/servicetype';
import type { WithPath } from '../../util/withpath';
import { copyPaths, getPath, withPath, withPaths } from '../../util/withpath';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  applyExistingSlots,
  assertAllLoaded,
  getSchedulingParametersGroup,
  resolveAvailability,
  slotsOverlappingInterval,
} from './utils/scheduling';

const bookOperation = {
  resourceType: 'OperationDefinition',
  name: 'book',
  status: 'active',
  kind: 'operation',
  code: 'book',
  resource: ['Appointment'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    { use: 'in', name: 'slot', type: 'Resource', min: 1, max: '*' },
    { use: 'in', name: 'patient-reference', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type BookParameters = {
  slot: Slot[];
  'patient-reference'?: Reference<Patient>;
};

// Finds keys that can be used to index into `T` and yield a primitive type
// that can be compared with strict equality.
type PrimitiveKey<T> = {
  [K in keyof T]-?: T[K] extends string | number | boolean | undefined ? K : never;
}[keyof T];

function assertAllMatch<T extends object>(
  objects: WithPath<T>[],
  attribute: PrimitiveKey<T> & string,
  msg: string
): void {
  if (objects.length <= 1) {
    return;
  }
  const mismatched = objects.find((value) => value[attribute] !== objects[0][attribute]);
  if (mismatched) {
    throw new OperationOutcomeError(
      badRequest(msg, [`${getPath(objects[0])}.${attribute}`, `${getPath(mismatched)}.${attribute}`])
    );
  }
}

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
  const proposedSlots = withPaths(params.slot, 'Parameters.slot');

  assertAllMatch(proposedSlots, 'start', 'Mismatched slot start times');
  assertAllMatch(proposedSlots, 'end', 'Mismatched slot end times');
  const { start, end } = proposedSlots[0];
  const startDate = new Date(start);
  const endDate = new Date(end);

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
