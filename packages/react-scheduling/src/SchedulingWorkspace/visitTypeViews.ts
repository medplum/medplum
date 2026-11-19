// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { isServiceKeptAtAnyLocation } from '../AppointmentFinder/AppointmentServiceSelect.utils';
import type { CalendarFilterValues } from './CalendarFilters';
import { MAX_AVAILABILITY_SERVICES } from './CalendarFilters.utils';

/** One visit type on the list, and which of its two views are on. */
export interface VisitTypeView {
  readonly service: WithId<HealthcareService>;
  /** Whether its appointments are drawn, once not every visit type's are. */
  readonly appointments: boolean;
  /** Whether its availability is shaded. */
  readonly availability: boolean;
}

/**
 * Prototype. The one list of visit types a viewer picks from once, each then shown as appointments,
 * as availability, or as both, in place of a filter field and an availability field picked from apart.
 */
export interface VisitTypeViews {
  /** Whether every visit type's appointments are drawn, whichever are listed. */
  readonly allAppointments: boolean;
  readonly listed: readonly VisitTypeView[];
}

function countShaded(listed: readonly VisitTypeView[]): number {
  return listed.filter((view) => view.availability).length;
}

/**
 * Reads the list back out of the filter values it was reported as, for a list mounted again.
 * A visit type listed with both views off, and one listed without its availability while every
 * appointment is drawn, are not in those values, so they are not listed again.
 * @param values - The filter values.
 * @returns The list.
 */
export function toVisitTypeViews(values: CalendarFilterValues | undefined): VisitTypeViews {
  const included = values?.services;
  const shaded = values?.availabilityServices ?? [];
  const services = new Map([...(included ?? []), ...shaded].map((service) => [service.id, service]));
  return {
    allAppointments: included === undefined,
    listed: [...services.values()].map((service) => ({
      service,
      appointments: !included || included.some((other) => other.id === service.id),
      availability: shaded.some((other) => other.id === service.id),
    })),
  };
}

/**
 * Works out what the list asks of the calendar.
 * @param views - The list.
 * @returns The visit types whose appointments are drawn, undefined for every one, and the ones shaded.
 */
export function toFilterServices(
  views: VisitTypeViews
): Pick<CalendarFilterValues, 'services' | 'availabilityServices'> {
  return {
    services: views.allAppointments
      ? undefined
      : views.listed.filter((view) => view.appointments).map((view) => view.service),
    availabilityServices: views.listed.filter((view) => view.availability).map((view) => view.service),
  };
}

/**
 * Lists a visit type, with both views on. Its availability starts off once as many are shaded as can be.
 * @param views - The list.
 * @param service - The visit type picked.
 * @returns The list with it on, or the same list if it already was.
 */
export function addVisitType(views: VisitTypeViews, service: WithId<HealthcareService>): VisitTypeViews {
  if (views.listed.some((view) => view.service.id === service.id)) {
    return views;
  }
  const availability = countShaded(views.listed) < MAX_AVAILABILITY_SERVICES;
  return { ...views, listed: [...views.listed, { service, appointments: true, availability }] };
}

/**
 * Reports whether a visit type's availability can be turned on: there is room for one more.
 * @param views - The list.
 * @returns Whether fewer are shaded than can be.
 */
export function canShadeAnother(views: VisitTypeViews): boolean {
  return countShaded(views.listed) < MAX_AVAILABILITY_SERVICES;
}

/**
 * Drops the visit types none of the sites hold, as the filter fields do when their sites change. A list
 * of appointments the sites empty goes back to every visit type, not to none.
 * @param views - The list.
 * @param sites - The sites now chosen.
 * @returns The list at those sites.
 */
export function keepVisitTypesAtSites(
  views: VisitTypeViews,
  sites: readonly (Reference<Location> | WithId<Location>)[]
): VisitTypeViews {
  const listed = views.listed.filter((view) => isServiceKeptAtAnyLocation(view.service, sites));
  const hadAppointments = views.listed.some((view) => view.appointments);
  const emptied = !views.allAppointments && hadAppointments && !listed.some((view) => view.appointments);
  return { allAppointments: views.allAppointments || emptied, listed };
}
