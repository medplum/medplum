// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  clearScheduleSchedulingParameter,
  createReference,
  deepClone,
  deepEquals,
  getReferenceString,
  SchedulingParametersURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { setScheduleAvailability } from '../../availability';
import type { ConfigurableActorResource } from '../../configSearch';
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
  toWeeklyAvailability,
} from '../../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';
import { getOfferedServices, isActorInactive, serviceTypeOffers } from '../SchedulingConfigWorkspace.utils';

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
  for (const service of services) {
    offerings[service.id] = schedule ? offeringFieldsOf(service, schedule) : newOfferingFields(service);
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
 * What a visit type starts with when it is first offered: nothing of the Schedule's own, so it follows the
 * visit type in everything.
 * @param service - The visit type.
 * @returns The fields.
 */
export function newOfferingFields(service: WithId<HealthcareService>): OfferingFields {
  return { parameters: {}, availability: { overriding: false, weekly: toWeeklyAvailability(service.availableTime) } };
}

/**
 * Builds the Schedule to store from what the page holds. Only what was edited is rewritten, so saving one field
 * leaves the rest of the Schedule as another tool wrote it.
 *
 * Returns undefined for an actor with no Schedule that offers nothing yet: a Schedule is created only once a
 * visit type is offered, and never on its own.
 * @param stored - The Schedule as stored, if the actor has one.
 * @param actor - The actor as edited, which a new Schedule is held on alone, and active only while it is.
 * @param fields - What the page holds.
 * @param initial - What the page opened with.
 * @param servicesById - Every visit type loaded.
 * @returns The Schedule to store, or undefined when there is none to create.
 */
export function buildScheduleDraft(
  stored: WithId<Schedule> | undefined,
  actor: ConfigurableActorResource,
  fields: ScheduleFields,
  initial: ScheduleFields,
  servicesById: ReadonlyMap<string, WithId<HealthcareService>>
): Schedule | undefined {
  if (!stored && Object.keys(fields.offerings).length === 0) {
    return undefined;
  }
  let draft: Schedule = stored
    ? deepClone(stored)
    : { resourceType: 'Schedule', active: !isActorInactive(actor), actor: [createReference(actor)] };

  if (stored && fields.active !== initial.active) {
    draft.active = fields.active;
  }

  for (const id of Object.keys(initial.offerings)) {
    const service = servicesById.get(id);
    if (service && !Object.hasOwn(fields.offerings, id)) {
      draft = withoutService(draft, service);
    }
  }

  for (const [id, current] of Object.entries(fields.offerings)) {
    const service = servicesById.get(id);
    if (!service) {
      continue;
    }
    const before = initial.offerings[id];
    if (!before) {
      draft.serviceType = [...(draft.serviceType ?? []), ...toServiceTypeCodeableConcepts(service)];
    }
    if (!before || !deepEquals(current.parameters, before.parameters)) {
      draft = setScheduleSchedulingParameterValues(draft, service, current.parameters);
    }
    // An emptied week has no stored form. The page refuses to save it, so it is left as stored meanwhile.
    const { overriding, weekly } = current.availability;
    if (
      (!before || !deepEquals(current.availability, before.availability)) &&
      (!overriding || hasAnyAvailableDay(weekly))
    ) {
      draft = overriding
        ? setScheduleAvailability(draft, service, fromWeeklyAvailability(weekly))
        : clearScheduleSchedulingParameter(draft, service, 'availability');
    }
  }
  return draft;
}

/**
 * Stops a Schedule offering a visit type: drops it from `serviceType`, and drops every scheduling parameter
 * entry scoped to it, including any this package doesn't edit. Left behind, they would come back if the visit
 * type were offered again.
 * @param schedule - The Schedule.
 * @param service - The visit type to stop offering.
 * @returns A copy of the Schedule without it.
 */
export function withoutService(schedule: Schedule, service: WithId<HealthcareService>): Schedule {
  const draft = deepClone(schedule);
  const reference = getReferenceString(service);
  const serviceType = draft.serviceType?.filter((concept) => !serviceTypeOffers([concept], service));
  if (serviceType?.length) {
    draft.serviceType = serviceType;
  } else {
    delete draft.serviceType;
  }
  const extension = draft.extension?.filter(
    (entry) =>
      entry.url !== SchedulingParametersURI ||
      !entry.extension?.some(
        (sub) => sub.url === 'service' && sub.valueReference?.reference?.split('/').slice(0, 2).join('/') === reference
      )
  );
  if (extension?.length) {
    draft.extension = extension;
  } else {
    delete draft.extension;
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
