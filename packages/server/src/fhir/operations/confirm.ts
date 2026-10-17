// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter } from '@medplum/core';
import {
  allOk,
  badRequest,
  DEFAULT_MAX_SEARCH_COUNT,
  extractServiceTypeReferences,
  flatMapFilter,
  getIdentifier,
  OperationOutcomeError,
  Operator,
  RecurringAppointmentSeriesIdentifierSystem,
  serverError,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Appointment, Resource, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { copyPaths, getPath, withPath, withPaths } from '../../util/withpath';
import type { Repository } from '../repo';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { assertAllLoaded } from './utils/scheduling';

const confirmOperation = makeOperationDefinition(
  { scope: 'instance', resource: 'Appointment' },
  {
    name: 'confirm',
    code: 'confirm',
    parameter: [
      { use: 'in', name: 'occurrences', type: 'code', min: 0, max: '1' },
      { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
    ],
  }
);

// Which occurrences of a recurring series to confirm, as a calendar asks when changing one event of many.
const OCCURRENCES = ['this', 'this-and-following', 'all'];

type ConfirmParameters = {
  occurrences?: string;
};

/**
 * Confirms one held Appointment, marking it "booked" and its `busy-tentative` Slots "busy".
 * The caller checks that it is `pending` or `proposed`.
 *
 * @param txRepo - The repository, inside the confirming transaction.
 * @param appointment - The Appointment to confirm.
 * @returns The booked Appointment, followed by its Slots.
 */
async function confirmAppointment(txRepo: Repository, appointment: Appointment): Promise<Resource[]> {
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
}

/**
 * Handles HTTP requests for the Appointment $confirm operation.
 *
 * Marks an Appointment created via `$hold` as "booked". With `occurrences`, also confirms the
 * pending occurrences of its recurring series that follow it, or all of them.
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
  const params = parseInputParameters<ConfirmParameters>(confirmOperation, req);
  const occurrences = params.occurrences ?? 'this';
  if (!OCCURRENCES.includes(occurrences)) {
    throw new OperationOutcomeError(
      badRequest(`occurrences must be one of ${OCCURRENCES.join(', ')}`, 'Parameters.occurrences')
    );
  }
  const appointmentId = req.params.id;
  const updatedResources = await ctx.repo.withTransaction(
    async (txRepo) => {
      const appointment = await txRepo.readResource<Appointment>('Appointment', appointmentId);
      if (appointment.status !== 'pending' && appointment.status !== 'proposed') {
        throw new OperationOutcomeError(
          badRequest(`Appointment cannot be confirmed in '${appointment.status}' status`)
        );
      }
      if (occurrences === 'this') {
        return confirmAppointment(txRepo, appointment);
      }
      const seriesId = getIdentifier(appointment, RecurringAppointmentSeriesIdentifierSystem);
      if (!seriesId) {
        throw new OperationOutcomeError(
          badRequest('Appointment is not part of a recurring series', 'Parameters.occurrences')
        );
      }
      // These would change the identifier search below rather than match themselves.
      if (/[,\\|$]/.test(seriesId) || seriesId.trim() !== seriesId) {
        throw new OperationOutcomeError(
          badRequest(
            'A series identifier with a comma, backslash, pipe, dollar sign, or surrounding whitespace cannot be searched'
          )
        );
      }

      // Having passed its status check, the Appointment is among the occurrences this finds.
      const filters: Filter[] = [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: `${RecurringAppointmentSeriesIdentifierSystem}|${seriesId}`,
        },
        // Occurrences already booked or cancelled are left alone.
        { code: 'status', operator: Operator.EQUALS, value: 'pending,proposed' },
      ];
      if (occurrences === 'this-and-following') {
        if (!appointment.start) {
          throw new OperationOutcomeError(
            badRequest('An Appointment without a start has no following occurrences', 'Parameters.occurrences')
          );
        }
        // Following by start rather than recurrenceId, which is a searchable/sortable parameter.
        filters.push({ code: 'date', operator: Operator.GREATER_THAN_OR_EQUALS, value: appointment.start });
      }
      const series = await txRepo.searchResources<Appointment>({
        resourceType: 'Appointment',
        // A series isn't capped at $book's occurrence count: $book can add sessions to one.
        count: DEFAULT_MAX_SEARCH_COUNT,
        filters,
        sortRules: [{ code: 'date' }],
      });

      if (!series.some((occurrence) => occurrence.id === appointment.id)) {
        throw new OperationOutcomeError(
          serverError(new Error('Search for the series missed the Appointment confirmed'))
        );
      }

      const updated: Resource[] = [];
      for (const occurrence of series) {
        updated.push(...(await confirmAppointment(txRepo, occurrence)));
      }
      return updated;
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
