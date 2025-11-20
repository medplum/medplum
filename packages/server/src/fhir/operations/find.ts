// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, getReferenceString, Operator } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, BundleEntry, OperationDefinition, Schedule, Slot } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'find',
  url: 'https://ihe.net/fhir/OperationDefinition/appointment-find',
  name: 'Find Available Appointment Slots',
  status: 'active',
  kind: 'operation',
  code: 'find',
  resource: ['Appointment', 'Slot', 'Schedule'],
  system: false,
  type: true,
  instance: true,
  parameter: [
    {
      name: 'start',
      use: 'in',
      min: 1,
      max: '1',
      type: 'dateTime',
      documentation: 'Start of availability search period. Must be in ISO 8601 format with timezone.',
    },
    {
      name: 'end',
      use: 'in',
      min: 1,
      max: '1',
      type: 'dateTime',
      documentation: 'End of availability search period. Must be in ISO 8601 format with timezone.',
    },
    {
      name: 'schedule',
      use: 'in',
      min: 1,
      max: '*',
      type: 'string',
      documentation: 'Direct Schedule resource reference(s). Format: Schedule/{id}. Multiple schedules calculate availability intersection.',
    },
    {
      name: 'service-type',
      use: 'in',
      min: 0,
      max: '*',
      type: 'string',
      documentation: 'Service type codes in format [system]|[code]. Used to select which scheduling-parameters extension applies.',
    },
    {
      name: 'patient-reference',
      use: 'in',
      min: 0,
      max: '1',
      type: 'string',
      documentation: 'Patient reference for context. Format: Patient/{id}.',
    },
    {
      name: 'return',
      use: 'out',
      min: 1,
      max: '1',
      type: 'Bundle',
      documentation: 'Bundle of type "searchset" containing proposed Appointment or Slot resources.',
    },
  ],
};

export interface FindParameters {
  start: string;
  end: string;
  schedule: string | string[];
  'service-type'?: string | string[];
  'patient-reference'?: string;
}

/**
 * Handles FHIR $find operation requests.
 * Finds available appointment slots based on schedule availability.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function findHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<FindParameters>(operation, req);

  // Check if schedule is in path (Schedule/:id/$find)
  const urlPath = req.url.split('?')[0];
  const scheduleIdFromPath = req.params?.id;

  // Validate start and end are always required
  if (!params.start || !params.end) {
    return [badRequest('Missing required parameters: start and end are required')];
  }

  // Parse schedule references (can be single string or array, or from path)
  let scheduleRefs: string[];
  if (scheduleIdFromPath && urlPath.includes('/Schedule/') && urlPath.includes('/$find')) {
    // Schedule/:id/$find - schedule inferred from path
    scheduleRefs = [`Schedule/${scheduleIdFromPath}`];
  } else {
    // Validate schedule parameter for other endpoints
    if (!params.schedule) {
      return [badRequest('Missing required parameter: schedule is required')];
    }
    scheduleRefs = Array.isArray(params.schedule) ? params.schedule : [params.schedule];
  }

  // Validate and load schedules
  const schedules: Schedule[] = [];
  for (const scheduleRef of scheduleRefs) {
    // Parse Schedule/{id} format
    if (!scheduleRef.startsWith('Schedule/')) {
      return [badRequest(`Invalid schedule reference format: ${scheduleRef}. Expected Schedule/{id}`)];
    }

    const scheduleId = scheduleRef.substring('Schedule/'.length);
    try {
      const schedule = await ctx.repo.readResource<Schedule>('Schedule', scheduleId);

      // Check if schedule is active (if active field exists and is false, skip it)
      if (schedule.active === false) {
        return [badRequest(`Schedule ${scheduleId} is not active`)];
      }

      schedules.push(schedule);
    } catch (error: any) {
      if (error.outcome?.id === 'not-found') {
        return [badRequest(`Schedule not found: ${scheduleId}`)];
      }
      throw error;
    }
  }

  if (schedules.length === 0) {
    return [badRequest('No valid schedules found')];
  }

  // Parse date range
  const searchStart = new Date(params.start);
  const searchEnd = new Date(params.end);

  if (isNaN(searchStart.getTime()) || isNaN(searchEnd.getTime())) {
    return [badRequest('Invalid date format for start or end parameter')];
  }

  if (searchEnd <= searchStart) {
    return [badRequest('End date must be after start date')];
  }

  // For Cycle 1.3: Query existing free Slots only (no availability rules yet)
  const entries: BundleEntry[] = [];

  for (const schedule of schedules) {
    const scheduleRef = getReferenceString(schedule);
    if (!scheduleRef) {
      continue;
    }

    // Query free slots for this schedule in the date range
    const slotsBundle = await ctx.repo.search({
      resourceType: 'Slot',
      filters: [
        { code: 'schedule', operator: Operator.EQUALS, value: scheduleRef },
        { code: 'status', operator: Operator.EQUALS, value: 'free' },
        { code: 'start', operator: Operator.GREATER_THAN_OR_EQUALS, value: params.start },
        { code: 'end', operator: Operator.LESS_THAN_OR_EQUALS, value: params.end },
      ],
    });

    // Convert to virtual slots (remove IDs)
    if (slotsBundle.entry) {
      for (const slotEntry of slotsBundle.entry) {
        const slot = slotEntry.resource as Slot;
        if (slot && slot.status === 'free') {
          // Create virtual slot without ID
          const virtualSlot: Slot = {
            resourceType: 'Slot',
            status: 'free',
            schedule: slot.schedule,
            start: slot.start,
            end: slot.end,
            serviceType: slot.serviceType,
          };

          entries.push({
            resource: virtualSlot,
            search: { mode: 'match' },
          });
        }
      }
    }
  }

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: entries,
  };

  return [allOk, bundle];
}

