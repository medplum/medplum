// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { clearScheduleSchedulingParameter, deepClone, deepEquals } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { setScheduleAvailability } from '../../availability';
import type { SchedulingParameterValues } from '../../parameterValues';
import {
  getScheduleSchedulingParameterValues,
  SCHEDULING_PARAMETER_LABELS,
  setScheduleSchedulingParameterValues,
} from '../../parameterValues';
import type { AvailabilityFieldsValue } from '../../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';
import {
  fromWeeklyAvailability,
  hasAnyAvailableDay,
  initialAvailabilityFieldsValue,
} from '../../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';
import { getOfferedServices } from '../SchedulingConfigWorkspace.utils';

/** What a Schedule sets for one visit type it offers. */
export interface OfferingFields {
  /** The parameters the Schedule overrides. */
  readonly parameters: SchedulingParameterValues;
  readonly availability: AvailabilityFieldsValue;
}

/** What the page holds for an actor's Schedule. */
export interface ScheduleFields {
  readonly active: boolean;
  /** Keyed by visit type id, for each one offered, in the order they are listed. */
  readonly offerings: Readonly<Record<string, OfferingFields>>;
}

/**
 * Seeds the page from the stored Schedule, or from nothing for an actor that has none.
 * @param schedule - The Schedule as stored.
 * @param servicesById - Every visit type loaded.
 * @returns What the page opens with.
 */
export function scheduleFieldsOf(
  schedule: WithId<Schedule> | undefined,
  servicesById: ReadonlyMap<string, WithId<HealthcareService>>
): ScheduleFields {
  const services = getOfferedServices(schedule, servicesById);
  const offerings: Record<string, OfferingFields> = {};
  if (schedule) {
    for (const service of services) {
      offerings[service.id] = offeringFieldsOf(service, schedule);
    }
  }
  return { active: schedule?.active !== false, offerings };
}

function offeringFieldsOf(service: WithId<HealthcareService>, schedule: Schedule): OfferingFields {
  return {
    parameters: getScheduleSchedulingParameterValues(schedule, service),
    availability: initialAvailabilityFieldsValue(service, schedule),
  };
}

/**
 * Builds the Schedule to store from what the page holds. Only what was edited is rewritten, so saving one field
 * leaves the rest of the Schedule as another tool wrote it.
 * @param stored - The Schedule as stored.
 * @param fields - What the page holds.
 * @param initial - What the page opened with.
 * @param servicesById - Every visit type loaded.
 * @returns The Schedule to store.
 */
export function buildScheduleDraft(
  stored: WithId<Schedule>,
  fields: ScheduleFields,
  initial: ScheduleFields,
  servicesById: ReadonlyMap<string, WithId<HealthcareService>>
): Schedule {
  let draft: Schedule = deepClone(stored);

  if (fields.active !== initial.active) {
    draft.active = fields.active;
  }

  for (const [id, current] of Object.entries(fields.offerings)) {
    const service = servicesById.get(id);
    if (!service) {
      continue;
    }
    const before = initial.offerings[id];
    if (!deepEquals(current.parameters, before.parameters)) {
      draft = setScheduleSchedulingParameterValues(draft, service, current.parameters);
    }
    // An emptied week has no stored form. The page refuses to save it, so it is left as stored meanwhile.
    const { overriding, weekly } = current.availability;
    if (!deepEquals(current.availability, before.availability) && (!overriding || hasAnyAvailableDay(weekly))) {
      draft = overriding
        ? setScheduleAvailability(draft, service, fromWeeklyAvailability(weekly))
        : clearScheduleSchedulingParameter(draft, service, 'availability');
    }
  }
  return draft;
}

/**
 * Whether a Schedule sets anything of its own for a visit type: a scheduling parameter, or custom hours.
 * @param fields - What the Schedule sets for it.
 * @returns True when it overrides the visit type in anything.
 */
export function hasOverrides(fields: OfferingFields): boolean {
  return (
    fields.availability.overriding ||
    (Object.keys(SCHEDULING_PARAMETER_LABELS) as (keyof SchedulingParameterValues)[]).some(
      (key) => fields.parameters[key] !== undefined
    )
  );
}
