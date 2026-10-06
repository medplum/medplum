// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  extractServiceTypeReferences,
  getDisplayString,
  getReferenceString,
  isDefined,
  resolveId,
} from '@medplum/core';
import type { HealthcareService, Resource, Schedule } from '@medplum/fhirtypes';
import type { BookableActorType } from '../actors';
import { isBookableActorType } from '../actors';
import type { ConfigurableActor, ConfigurableActorResource } from '../configSearch';
import type { ConfigPanelItem } from './ConfigPanel/ConfigPanel';
import type { ConfigStatus } from './StatusBadge';

/**
 * What the detail pane shows: a stored visit type or actor, kept by id so it survives a save replacing it in
 * the list, or a visit type being created, which has no id until it is saved. An actor's page may be opened on
 * one of the visit types it offers.
 */
export type ConfigSelection =
  | { readonly kind: 'service'; readonly id: string }
  | { readonly kind: 'new-service'; readonly key: number }
  | {
      readonly kind: 'actor';
      readonly resourceType: BookableActorType;
      readonly id: string;
      /** The visit type whose entry is open. Left out, every entry is closed. */
      readonly openServiceId?: string;
    };

/**
 * Whether two selections open the same page.
 * @param a - One selection.
 * @param b - The other, if any.
 * @returns True when both name the same stored resource, or the same visit type being created.
 */
export function isSameSelection(a: ConfigSelection, b: ConfigSelection | undefined): boolean {
  if (a.kind === 'service') {
    return b?.kind === 'service' && b.id === a.id;
  }
  if (a.kind === 'new-service') {
    return b?.kind === 'new-service' && b.key === a.key;
  }
  return b?.kind === 'actor' && b.resourceType === a.resourceType && b.id === a.id;
}

/**
 * Whether a row's label matches what was typed into the panel's filter, ignoring case.
 * @param label - The row's label.
 * @param filter - What was typed. Blank matches everything.
 * @returns True when the row should stay.
 */
export function matchesFilter(label: string, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  return !needle || label.toLowerCase().includes(needle);
}

/**
 * Builds the rows of the Visit types section, narrowed by the filter.
 * @param services - Every visit type loaded.
 * @param selection - What is selected, if anything.
 * @param filter - What was typed into the panel's filter.
 * @param showInactive - Whether turned-off visit types are listed. The selected one always is, so it cannot
 * vanish when turned off.
 * @returns The rows to list.
 */
export function buildServiceItems(
  services: readonly WithId<HealthcareService>[],
  selection: ConfigSelection | undefined,
  filter: string,
  showInactive: boolean
): ConfigPanelItem[] {
  return services
    .filter((service) => showInactive || service.active !== false || isSelected(service, selection))
    .map((service): ConfigPanelItem => ({
      id: service.id,
      label: getDisplayString(service),
      selected: isSelected(service, selection),
      inactive: service.active === false,
    }))
    .filter((item) => matchesFilter(item.label, filter));
}

function isSelected(service: WithId<HealthcareService>, selection: ConfigSelection | undefined): boolean {
  return selection?.kind === 'service' && selection.id === service.id;
}

/**
 * Puts a stored visit type into the list in place of the version it replaces, or where its name sorts when it
 * is new, so a save shows at once without refetching.
 * @param services - The visit types listed.
 * @param stored - The visit type as the server now holds it.
 * @returns The new list.
 */
export function withStoredService(
  services: readonly WithId<HealthcareService>[],
  stored: WithId<HealthcareService>
): WithId<HealthcareService>[] {
  const others = services.filter((service) => service.id !== stored.id);
  const name = stored.name ?? '';
  const index = others.findIndex((service) => (service.name ?? '').localeCompare(name) > 0);
  return index < 0 ? [...others, stored] : [...others.slice(0, index), stored, ...others.slice(index)];
}

/**
 * Whether an actor is turned off: a provider marked inactive, or a room or device whose status is `inactive`.
 * @param resource - The provider, room, or device.
 * @returns True when it is inactive.
 */
export function isActorInactive(resource: ConfigurableActorResource): boolean {
  return resource.resourceType === 'Practitioner' ? resource.active === false : resource.status === 'inactive';
}

/**
 * Whether an actor can be booked as far as its own status and its Schedule's go. The actor's own status wins:
 * switching the Schedule back on wouldn't make an inactive actor bookable.
 * @param resource - The provider, room, or device.
 * @param scheduleActive - Whether its Schedule is active, or undefined when it has none.
 * @returns Its status.
 */
export function getActorStatus(resource: ConfigurableActorResource, scheduleActive: boolean | undefined): ConfigStatus {
  if (isActorInactive(resource)) {
    return 'inactive';
  }
  return scheduleActive === false ? 'schedule-inactive' : 'active';
}

function getStoredActorStatus(actor: ConfigurableActor): ConfigStatus {
  const [schedule] = actor.schedules;
  return getActorStatus(actor.resource, schedule && schedule.active !== false);
}

/**
 * The visit types a Schedule offers, in the order it lists them. A visit type that isn't loaded is left out.
 * @param schedule - The Schedule.
 * @param servicesById - Every visit type loaded.
 * @returns The visit types it offers.
 */
export function getOfferedServices(
  schedule: Schedule | undefined,
  servicesById: ReadonlyMap<string, WithId<HealthcareService>>
): WithId<HealthcareService>[] {
  const ids = new Set(
    extractServiceTypeReferences(schedule?.serviceType)
      .map((reference) => resolveId(reference))
      .filter(isDefined)
  );
  return [...ids].flatMap((id) => servicesById.get(id) ?? []);
}

/**
 * What still needs finishing on an actor, as the sidebar marks it.
 * @param actor - The actor and its Schedules. The first Schedule is the one the workspace edits.
 * @returns The notices to show on its row.
 */
export function getActorNotices(actor: ConfigurableActor): string[] {
  // An inactive actor's row is already marked Inactive, which says more.
  return getStoredActorStatus(actor) === 'schedule-inactive' ? ['Schedule inactive'] : [];
}

// Booking skips an actor when either it or its Schedule is off, so Show inactive hides both alike. An actor with
// no Schedule yet isn't turned off, only unfinished, so it stays listed.
function isActorTurnedOff(actor: ConfigurableActor): boolean {
  return getStoredActorStatus(actor) !== 'active';
}

/**
 * Builds the rows of a Providers, Rooms, or Devices section, narrowed by the filter.
 * @param actors - Every actor of the section's type loaded.
 * @param selection - What is selected, if anything.
 * @param filter - What was typed into the panel's filter.
 * @param showInactive - Whether actors that are turned off, or whose Schedule is, are listed. The selected one
 * always is.
 * @returns The rows to list.
 */
export function buildActorItems(
  actors: readonly ConfigurableActor[],
  selection: ConfigSelection | undefined,
  filter: string,
  showInactive: boolean
): ConfigPanelItem[] {
  return actors
    .filter((actor) => showInactive || !isActorTurnedOff(actor) || isActorSelected(actor, selection))
    .map((actor): ConfigPanelItem => ({
      id: actor.resource.id,
      label: getDisplayString(actor.resource),
      selected: isActorSelected(actor, selection),
      inactive: isActorInactive(actor.resource),
      notices: getActorNotices(actor),
    }))
    .filter((item) => matchesFilter(item.label, filter));
}

function isActorSelected(actor: ConfigurableActor, selection: ConfigSelection | undefined): boolean {
  return (
    selection?.kind === 'actor' &&
    selection.resourceType === actor.resource.resourceType &&
    selection.id === actor.resource.id
  );
}

/**
 * Puts a stored resource into the actors listed, so a save shows at once without refetching: an actor replaces
 * the version it was loaded as, and a Schedule replaces or joins the Schedules of its only actor. Anything
 * else, or anything about an actor not listed, leaves the list as it was.
 * @param actors - The actors listed.
 * @param stored - The resource as the server now holds it.
 * @returns The new list.
 */
export function withStoredActorResource(
  actors: readonly ConfigurableActor[],
  stored: WithId<Resource>
): readonly ConfigurableActor[] {
  if (isBookableActorType(stored.resourceType)) {
    return actors.map((actor) =>
      actor.resource.resourceType === stored.resourceType && actor.resource.id === stored.id
        ? { ...actor, resource: stored }
        : actor
    );
  }
  if (stored.resourceType !== 'Schedule' || stored.actor.length !== 1) {
    return actors;
  }
  const owner = stored.actor[0].reference;
  return actors.map((actor) => {
    if (getReferenceString(actor.resource) !== owner) {
      return actor;
    }
    const index = actor.schedules.findIndex((schedule) => schedule.id === stored.id);
    return {
      ...actor,
      schedules: index < 0 ? [...actor.schedules, stored] : actor.schedules.with(index, stored),
    };
  });
}
